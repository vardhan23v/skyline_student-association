import type { Knex } from 'knex';
import { getDb, lockRow } from '../../config/db';
import { env } from '../../config/env';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { recordEntry, reversePaymentIncome } from '../finance/service';
import { createPendingPayment, settlePayment } from '../payments/service';
import { isActiveMember } from '../memberships/service';
import { emitOrder } from './events';

/** `created_at` comes from the DB default: DATETIME on MySQL, 'YYYY-MM-DD HH:MM:SS' (UTC) text on SQLite — a JS Date binds as epoch ms there. */
const createdAtBound = (db: Knex, d: Date) => (db.client.config.client === 'mysql2' ? d : d.toISOString().replace('T', ' ').slice(0, 19));

export async function listProducts(user?: { id: number }, includeInactive = false) {
  const db = getDb();
  const products = await db('products').modify((qb) => { if (!includeInactive) qb.where('is_active', true); }).orderBy('name');
  const variants = await db('product_variants').whereIn('product_id', products.map((p: any) => p.id)).orderBy('id'); // sizes in the order they were added (S, M, L…)
  const member = await isActiveMember(db, user?.id);
  return products.map((p: any) => ({ ...p, variants: variants.filter((v: any) => v.product_id === p.id).map((v: any) => ({ ...v, available: v.stock - v.reserved, price_for_you: Number(member ? v.member_price : v.price) })) }));
}

export async function createProduct(input: { name: string; description?: string; image_url?: string; variants: { size: string; price: number; member_price: number; stock: number }[] }) {
  const db = getDb();
  return db.transaction(async (trx) => {
    const { variants, ...p } = input;
    const [id] = await trx('products').insert(p);
    await trx('product_variants').insert(variants.map((v) => ({ ...v, product_id: id })));
    return id;
  });
}
export async function updateProduct(id: number, input: any) {
  const db = getDb();
  if (!(await db('products').where({ id }).first())) throw notFound('Product not found');
  if (Object.keys(input).length) await db('products').where({ id }).update(input);
}

/** Invariant §4.3.3 `reserved <= stock`: stock can't be cut below what pending orders already hold. */
export async function updateVariant(id: number, input: any) {
  const db = getDb();
  if (!(await db('product_variants').where({ id }).first())) throw notFound('Variant not found');
  if (!Object.keys(input).length) return;
  const qb = db('product_variants').where({ id });
  if (input.stock !== undefined) qb.where('reserved', '<=', input.stock);
  const n = await qb.update(input);
  if (!n) throw conflict('Stock cannot be set below the quantity reserved by pending orders');
}

/** Reserve stock with a conditional UPDATE (`stock - reserved >= qty`) and commit, then create the pending payment. */
export async function placeOrder(user_id: number, items: { variant_id: number; qty: number }[]) {
  const db = getDb();
  const hold = await db.transaction(async (trx) => {
    const member = await isActiveMember(trx, user_id);
    let subtotalPaise = 0;
    const lines: { variant_id: number; qty: number; unit_price: number }[] = [];
    // Lock variants in id order so two orders with the same variants in different order can't deadlock on MySQL.
    for (const it of [...items].sort((a, b) => a.variant_id - b.variant_id)) {
      const v = await lockRow(trx('product_variants').where({ id: it.variant_id })).first();
      if (!v) throw notFound(`Variant ${it.variant_id} not found`);
      const p = await trx('products').where({ id: v.product_id }).first('is_active');
      if (!p || !p.is_active) throw notFound(`Variant ${it.variant_id} not found`); // hidden/withdrawn products are not for sale
      const n = await trx('product_variants').where({ id: it.variant_id }).whereRaw('stock - reserved >= ?', [it.qty]).increment('reserved', it.qty);
      if (n === 0) throw conflict(`Insufficient stock for ${v.size}`);
      const unit_price = Number(member ? v.member_price : v.price);
      subtotalPaise += Math.round(unit_price * 100) * it.qty; // integer paise: no float drift in the charged amount
      lines.push({ variant_id: it.variant_id, qty: it.qty, unit_price });
    }
    const subtotal = subtotalPaise / 100;
    const [order_id] = await trx('orders').insert({ user_id, subtotal, total: subtotal, status: 'pending' });
    await trx('order_items').insert(lines.map((l) => ({ ...l, order_id })));
    return { order_id: order_id as number, subtotal, lines }; // stock is held by the committed reservation
  });
  // The provider order (an HTTP call to Razorpay) is created after the variant row locks are released; if it fails,
  // release the reservation straight away instead of holding stock for the 15-minute expiry window.
  try {
    const placed = await db.transaction(async (trx) => {
      const { payment_id, checkout } = await createPendingPayment(trx, { user_id, amount: hold.subtotal, purpose: 'merch', reference_type: 'order', reference_id: hold.order_id });
      await trx('orders').where({ id: hold.order_id }).update({ payment_id });
      return { order: await trx('orders').where({ id: hold.order_id }).first(), items: hold.lines, checkout };
    });
    emitOrder(hold.order_id);
    return placed;
  } catch (err) {
    await cancelPendingOrder(db, hold.order_id);
    emitOrder(hold.order_id);
    throw err;
  }
}

/** settlePayment (webhook, demo-confirm, admin cash): reserved → sold (stock decremented), ledger `in`. */
export async function markOrderPaid(trx: Knex.Transaction, order_id: number, payment_id: number, entered_by?: number) {
  const o = await trx('orders').where({ id: order_id }).first();
  if (!o) throw notFound('Order not found');
  const recordIncome = (memo = `Order #${order_id}`) => Number(o.total) > 0
    ? recordEntry(trx, { direction: 'in', amount: Number(o.total), category: 'merch', source_type: 'payment', source_id: payment_id, memo, entered_by: entered_by ?? o.user_id })
    : undefined;
  const items = await trx('order_items').where({ order_id }).orderBy('variant_id');
  if (o.status === 'cancelled') {
    // Payment captured after the hold expired and the reservation was released. The money was received, so it must
    // reach the ledger (§4.3 inv. 4); sell from free stock if every line still fits, else leave cancelled for a refund.
    const taken: any[] = [];
    for (const it of items) {
      const n = await trx('product_variants').where({ id: it.variant_id }).whereRaw('stock - reserved >= ?', [it.qty]).decrement('stock', it.qty);
      if (!n) break;
      taken.push(it);
    }
    if (taken.length < items.length) {
      for (const it of taken) await trx('product_variants').where({ id: it.variant_id }).increment('stock', it.qty);
      await recordIncome(`Order #${order_id}: hold expired and stock gone, refund due`);
      logger.error({ order_id, payment_id }, 'late payment for cancelled order and stock is gone: refund due');
      return o;
    }
  } else if (o.status !== 'pending') {
    return o;
  } else {
    for (const it of items) {
      await trx('product_variants').where({ id: it.variant_id }).decrement('reserved', it.qty).decrement('stock', it.qty);
    }
  }
  await trx('orders').where({ id: order_id }).update({ status: 'paid', payment_id });
  await recordIncome();
  return trx('orders').where({ id: order_id }).first();
}

const itemsQuery = (db: Knex, order_ids: number[]) => db('order_items as i')
  .join('product_variants as v', 'v.id', 'i.variant_id').join('products as p', 'p.id', 'v.product_id')
  .whereIn('i.order_id', order_ids).select('i.order_id', 'i.variant_id', 'i.qty', 'i.unit_price', 'v.size', 'p.id as product_id', 'p.name as product').orderBy('i.id');

const shapeItem = (i: any) => ({ variant_id: i.variant_id, product_id: i.product_id, product: i.product, size: i.size, qty: Number(i.qty), unit_price: Number(i.unit_price) });

export async function getOrder(id: number, user: { id: number; role: string }) {
  const db = getDb();
  const o = await db('orders as o').leftJoin('payments as pay', 'pay.id', 'o.payment_id').where('o.id', id).first('o.*', 'pay.status as payment_status');
  if (!o) throw notFound('Order not found');
  if (o.user_id !== user.id && user.role !== 'admin') throw forbidden();
  return { ...o, items: (await itemsQuery(db, [id])).map(shapeItem) };
}

/** GET /orders/mine — the caller's orders, newest first, with their lines. */
export async function myOrders(user_id: number) {
  const db = getDb();
  const orders = await db('orders as o').leftJoin('payments as pay', 'pay.id', 'o.payment_id').where('o.user_id', user_id)
    .select('o.id', 'o.created_at', 'o.total', 'o.status', 'o.payment_id', 'o.fulfilled_at', 'pay.status as payment_status').orderBy('o.id', 'desc');
  const items = orders.length ? await itemsQuery(db, orders.map((o: any) => o.id)) : [];
  return orders.map((o: any) => ({ ...o, total: Number(o.total), items: items.filter((i: any) => i.order_id === o.id).map(shapeItem) }));
}

export type AdminOrdersQuery = { status?: string; q?: string; page?: number; page_size?: number };

/** GET /admin/orders — the Orders table. `q` matches customer name or email. */
export async function adminOrders(q: AdminOrdersQuery) {
  const db = getDb();
  const page = q.page ?? 1, page_size = q.page_size ?? 25;
  const base = () => db('orders as o').join('users as u', 'u.id', 'o.user_id').modify((qb) => {
    if (q.status) qb.where('o.status', q.status);
    if (q.q) qb.where((w) => w.where('u.name', 'like', `%${q.q}%`).orWhere('u.email', 'like', `%${q.q}%`));
  });
  const [{ n }] = await base().count({ n: '*' });
  const ids = await base().orderBy('o.id', 'desc').limit(page_size).offset((page - 1) * page_size).pluck('o.id');
  return { rows: await adminOrderRows(db, ids), total: Number(n), page, page_size };
}

/** The admin row shape, shared by the list and the live stream so the dashboard can upsert either. */
async function adminOrderRows(db: Knex, ids: number[]) {
  if (!ids.length) return [];
  const orders = await db('orders as o').join('users as u', 'u.id', 'o.user_id').leftJoin('payments as pay', 'pay.id', 'o.payment_id').whereIn('o.id', ids)
    .select('o.id', 'o.created_at', 'o.total', 'o.status', 'o.user_id', 'u.name', 'u.email', 'pay.status as payment_status').orderBy('o.id', 'desc');
  const items = await itemsQuery(db, ids);
  const members = new Set<number>();
  for (const uid of new Set(orders.map((o: any) => Number(o.user_id)))) if (await isActiveMember(db, uid)) members.add(uid);
  return orders.map((o: any) => ({
    id: o.id, created_at: o.created_at,
    customer: { id: o.user_id, name: o.name, email: o.email, is_member: members.has(Number(o.user_id)) },
    items: items.filter((i: any) => i.order_id === o.id).map((i: any) => ({ product: i.product, size: i.size, qty: Number(i.qty), unit_price: Number(i.unit_price) })),
    total: Number(o.total), payment_status: o.payment_status ?? null, status: o.status,
  }));
}

export async function adminOrderRow(id: number) {
  return (await adminOrderRows(getDb(), [id]))[0] ?? null;
}

type OrderStatus = 'pending' | 'paid' | 'fulfilled' | 'cancelled';
/** Allowed admin transitions: pending → paid → fulfilled, and anything except cancelled → cancelled. */
const NEXT: Record<OrderStatus, OrderStatus[]> = { pending: ['paid', 'cancelled'], paid: ['fulfilled', 'cancelled'], fulfilled: ['cancelled'], cancelled: [] };

/**
 * PATCH /admin/orders/:id. pending → paid records the money as cash taken by the admin (same settle path as the
 * webhook, so stock and the ledger move identically). Cancelling a pending order releases its reservation; cancelling a
 * paid or fulfilled one puts the stock back, reverses the ledger income and marks the payment refunded.
 */
export async function setOrderStatus(admin_id: number, order_id: number, to: OrderStatus) {
  const db = getDb();
  await db.transaction(async (trx) => {
    const o = await lockRow(trx('orders').where({ id: order_id })).first();
    if (!o) throw notFound('Order not found');
    if (!NEXT[o.status as OrderStatus].includes(to)) throw conflict(`Cannot move an order from ${o.status} to ${to}`, 'INVALID_TRANSITION', { from: o.status, to, allowed: NEXT[o.status as OrderStatus] });
    const payment = o.payment_id ? await lockRow(trx('payments').where({ id: o.payment_id })).first() : null;
    if (to === 'paid') {
      if (!payment) throw conflict('Order has no payment to settle', 'INVALID_TRANSITION');
      await settlePayment(trx, payment, `cash_order_${order_id}_${Date.now()}`, { entered_by: admin_id, provider: 'cash' });
      if ((await trx('orders').where({ id: order_id }).first()).status !== 'paid') throw conflict('Stock is no longer available for this order', 'INSUFFICIENT_STOCK');
    } else if (to === 'fulfilled') {
      await trx('orders').where({ id: order_id }).update({ status: 'fulfilled', fulfilled_at: new Date() });
    } else if (o.status === 'pending') {
      await trx('orders').where({ id: order_id }).update({ status: 'cancelled' });
      for (const it of await trx('order_items').where({ order_id }).orderBy('variant_id')) await trx('product_variants').where({ id: it.variant_id }).decrement('reserved', it.qty);
    } else {
      await trx('orders').where({ id: order_id }).update({ status: 'cancelled' });
      for (const it of await trx('order_items').where({ order_id }).orderBy('variant_id')) await trx('product_variants').where({ id: it.variant_id }).increment('stock', it.qty);
      if (payment?.status === 'paid') {
        await reversePaymentIncome(trx, payment.id, `Order #${order_id} cancelled after payment: refund due`, admin_id);
        await trx('payments').where({ id: payment.id }).update({ status: 'refunded' });
      }
    }
  });
  return adminOrderRow(order_id);
}

/** Job: cancel stale pending orders and release reserved stock. */
export async function expirePendingOrders(db: Knex = getDb()) {
  const cutoff = new Date(Date.now() - env.PENDING_HOLD_MINUTES * 60_000);
  const stale = await db('orders').where({ status: 'pending' }).where('created_at', '<', createdAtBound(db, cutoff));
  for (const o of stale) { await cancelPendingOrder(db, o.id); emitOrder(o.id); }
  return stale.length;
}

/** pending → cancelled and release its reserved stock (no-op if it is no longer pending). */
async function cancelPendingOrder(db: Knex, order_id: number) {
  await db.transaction(async (trx) => {
    const n = await trx('orders').where({ id: order_id, status: 'pending' }).update({ status: 'cancelled' });
    if (!n) return;
    for (const it of await trx('order_items').where({ order_id })) await trx('product_variants').where({ id: it.variant_id }).decrement('reserved', it.qty);
  });
}
