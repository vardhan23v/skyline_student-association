import type { Knex } from 'knex';
import { getDb, lockRow } from '../../config/db';
import { env } from '../../config/env';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { recordEntry } from '../finance/service';
import { createPendingPayment } from '../payments/service';
import { isActiveMember } from '../memberships/service';

/** `created_at` comes from the DB default: DATETIME on MySQL, 'YYYY-MM-DD HH:MM:SS' (UTC) text on SQLite — a JS Date binds as epoch ms there. */
const createdAtBound = (db: Knex, d: Date) => (db.client.config.client === 'mysql2' ? d : d.toISOString().replace('T', ' ').slice(0, 19));

export async function listProducts(user?: { id: number }, includeInactive = false) {
  const db = getDb();
  const products = await db('products').modify((qb) => { if (!includeInactive) qb.where('is_active', true); }).orderBy('name');
  const variants = await db('product_variants').whereIn('product_id', products.map((p: any) => p.id));
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
    return await db.transaction(async (trx) => {
      const { payment_id, checkout } = await createPendingPayment(trx, { user_id, amount: hold.subtotal, purpose: 'merch', reference_type: 'order', reference_id: hold.order_id });
      await trx('orders').where({ id: hold.order_id }).update({ payment_id });
      return { order: await trx('orders').where({ id: hold.order_id }).first(), items: hold.lines, checkout };
    });
  } catch (err) {
    await cancelPendingOrder(db, hold.order_id);
    throw err;
  }
}

/** Webhook: reserved → sold (stock decremented), ledger `in`. */
export async function markOrderPaid(trx: Knex.Transaction, order_id: number, payment_id: number) {
  const o = await trx('orders').where({ id: order_id }).first();
  if (!o) throw notFound('Order not found');
  const recordIncome = (memo = `Order #${order_id}`) => Number(o.total) > 0
    ? recordEntry(trx, { direction: 'in', amount: Number(o.total), category: 'merch', source_type: 'payment', source_id: payment_id, memo, entered_by: o.user_id })
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

export async function getOrder(id: number, user: { id: number; role: string }) {
  const o = await getDb()('orders').where({ id }).first();
  if (!o) throw notFound('Order not found');
  if (o.user_id !== user.id && user.role !== 'admin') throw forbidden();
  const items = await getDb()('order_items as i').join('product_variants as v', 'v.id', 'i.variant_id').join('products as p', 'p.id', 'v.product_id')
    .select('i.*', 'v.size', 'p.name').where('i.order_id', id);
  return { ...o, items };
}
export const listOrders = (user: { id: number; role: string }) =>
  getDb()('orders').modify((qb) => { if (user.role !== 'admin') qb.where({ user_id: user.id }); }).orderBy('id', 'desc');

export async function fulfilOrder(id: number) {
  const o = await getDb()('orders').where({ id }).first();
  if (!o) throw notFound('Order not found');
  if (o.status !== 'paid') throw badRequest('Only paid orders can be fulfilled');
  // Conditional so two concurrent clicks can't both "fulfil" (and overwrite fulfilled_at).
  const n = await getDb()('orders').where({ id, status: 'paid' }).update({ status: 'fulfilled', fulfilled_at: new Date() });
  if (!n) throw badRequest('Only paid orders can be fulfilled');
  return getDb()('orders').where({ id }).first();
}

/** Job: cancel stale pending orders and release reserved stock. */
export async function expirePendingOrders(db: Knex = getDb()) {
  const cutoff = new Date(Date.now() - env.PENDING_HOLD_MINUTES * 60_000);
  const stale = await db('orders').where({ status: 'pending' }).where('created_at', '<', createdAtBound(db, cutoff));
  for (const o of stale) await cancelPendingOrder(db, o.id);
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
