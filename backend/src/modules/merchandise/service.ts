import type { Knex } from 'knex';
import { getDb, lockRow } from '../../config/db';
import { env } from '../../config/env';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { recordEntry } from '../finance/service';
import { createPendingPayment } from '../payments/service';
import { isActiveMember } from '../memberships/service';

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
export const updateProduct = (id: number, input: any) => getDb()('products').where({ id }).update(input);
export const updateVariant = (id: number, input: any) => getDb()('product_variants').where({ id }).update(input);

/** Reserve stock with a conditional UPDATE (`stock - reserved >= qty`), then create pending payment. */
export async function placeOrder(user_id: number, items: { variant_id: number; qty: number }[]) {
  const db = getDb();
  return db.transaction(async (trx) => {
    const member = await isActiveMember(trx, user_id);
    let subtotal = 0;
    const lines: { variant_id: number; qty: number; unit_price: number }[] = [];
    for (const it of items) {
      const v = await lockRow(trx('product_variants').where({ id: it.variant_id })).first();
      if (!v) throw notFound(`Variant ${it.variant_id} not found`);
      const n = await trx('product_variants').where({ id: it.variant_id }).whereRaw('stock - reserved >= ?', [it.qty]).increment('reserved', it.qty);
      if (n === 0) throw conflict(`Insufficient stock for ${v.size}`);
      const unit_price = Number(member ? v.member_price : v.price);
      subtotal += unit_price * it.qty;
      lines.push({ variant_id: it.variant_id, qty: it.qty, unit_price });
    }
    const [order_id] = await trx('orders').insert({ user_id, subtotal, total: subtotal, status: 'pending' });
    await trx('order_items').insert(lines.map((l) => ({ ...l, order_id })));
    const { payment_id, checkout } = await createPendingPayment(trx, { user_id, amount: subtotal, purpose: 'merch', reference_type: 'order', reference_id: order_id as number });
    await trx('orders').where({ id: order_id }).update({ payment_id });
    return { order: await trx('orders').where({ id: order_id }).first(), items: lines, checkout };
  });
}

/** Webhook: reserved → sold (stock decremented), ledger `in`. */
export async function markOrderPaid(trx: Knex.Transaction, order_id: number, payment_id: number) {
  const o = await trx('orders').where({ id: order_id }).first();
  if (!o) throw notFound('Order not found');
  if (o.status !== 'pending') return o;
  const items = await trx('order_items').where({ order_id });
  for (const it of items) {
    await trx('product_variants').where({ id: it.variant_id }).decrement('reserved', it.qty).decrement('stock', it.qty);
  }
  await trx('orders').where({ id: order_id }).update({ status: 'paid', payment_id });
  await recordEntry(trx, { direction: 'in', amount: Number(o.total), category: 'merch', source_type: 'payment', source_id: payment_id, memo: `Order #${order_id}`, entered_by: o.user_id });
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
  await getDb()('orders').where({ id }).update({ status: 'fulfilled', fulfilled_at: new Date() });
  return getDb()('orders').where({ id }).first();
}

/** Job: cancel stale pending orders and release reserved stock. */
export async function expirePendingOrders(db: Knex = getDb()) {
  const cutoff = new Date(Date.now() - env.PENDING_HOLD_MINUTES * 60_000);
  const stale = await db('orders').where({ status: 'pending' }).where('created_at', '<', cutoff);
  for (const o of stale) {
    await db.transaction(async (trx) => {
      const n = await trx('orders').where({ id: o.id, status: 'pending' }).update({ status: 'cancelled' });
      if (!n) return;
      for (const it of await trx('order_items').where({ order_id: o.id })) await trx('product_variants').where({ id: it.variant_id }).decrement('reserved', it.qty);
    });
  }
  return stale.length;
}
