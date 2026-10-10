import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { freshDb, getDb } from './setup';
import { createApp } from '../src/app';
import { hmacSha256 } from '../src/lib/hash';
import { env } from '../src/config/env';
import { signToken, type Role } from '../src/middleware/auth';
import { expirePendingTickets } from '../src/modules/events/service';
import { expirePendingOrders } from '../src/modules/merchandise/service';
import { paymentProvider } from '../src/modules/payments/provider';

let app: ReturnType<typeof createApp>;
const users: Record<string, { id: number; token: string }> = {};
const auth = (who: string) => ({ Authorization: `Bearer ${users[who].token}` });
const OLD = '2020-01-01 00:00:00'; // same text format SQLite's CURRENT_TIMESTAMP default writes

const webhook = (order_id: string, payment_id: string, amount: number) => {
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: payment_id, order_id, amount: Math.round(amount * 100) } } } });
  return request(app).post('/api/webhooks/payment').set('Content-Type', 'application/json').set('X-Razorpay-Signature', hmacSha256(env.PAYMENT_WEBHOOK_SECRET, body)).send(body);
};
const ledgerFor = (payment_id: number) => getDb()('ledger_entries').where({ source_type: 'payment', source_id: payment_id });

beforeAll(async () => {
  await freshDb();
  app = createApp();
  const db = getDb();
  const people: [string, Role][] = [['admin', 'admin'], ['treasurer', 'treasurer'], ['volunteer', 'volunteer'], ['member', 'member'], ['other', 'member']];
  for (const [name, role] of people) {
    const [id] = await db('users').insert({ name, email: `${name}@em.test`, password_hash: 'x', role });
    users[name] = { id: id as number, token: signToken({ id: id as number, role, email: `${name}@em.test` }) };
  }
  const [mid] = await db('members').insert({ user_id: users.member.id, student_id: 'EM1', joined_at: '2026-01-01' });
  await db('memberships').insert({ member_id: mid, start_date: '2026-01-01', expiry_date: '2099-06-30', status: 'active' });
});

const newEvent = async (capacity: number, extra: Record<string, unknown> = {}) => {
  const r = await request(app).post('/api/events').set(auth('admin'))
    .send({ title: `E${Math.random()}`, starts_at: new Date(Date.now() + 864e5).toISOString(), capacity, member_price: 100, non_member_price: 250, status: 'published', ...extra });
  expect(r.status).toBe(201);
  return r.body.id as number;
};

describe('events & tickets', () => {
  it('cash door sale is treasurer-only (separation of duties) and the ledger records who took the cash', async () => {
    const eid = await newEvent(5);
    expect((await request(app).post(`/api/events/${eid}/cash-ticket`).set(auth('admin')).send({ holder_name: 'Door', holder_email: 'd@em.test' })).status).toBe(403);
    const r = await request(app).post(`/api/events/${eid}/cash-ticket`).set(auth('treasurer')).send({ holder_name: 'Door', holder_email: 'd@em.test' });
    expect(r.status).toBe(201); expect(r.body.status).toBe('confirmed');
    const [entry] = await ledgerFor(r.body.payment_id);
    expect(entry.entered_by).toBe(users.treasurer.id); expect(Number(entry.amount)).toBe(250);
  });

  it('only the holder or an admin can read a ticket (and its QR)', async () => {
    const eid = await newEvent(5, { member_price: 0, non_member_price: 0 });
    const r = await request(app).post(`/api/events/${eid}/tickets`).set(auth('member')).send({});
    expect(r.body.ticket.status).toBe('confirmed');
    const id = r.body.ticket.id;
    expect((await request(app).get(`/api/tickets/${id}`).set(auth('member'))).status).toBe(200);
    expect((await request(app).get(`/api/tickets/${id}`).set(auth('volunteer'))).status).toBe(403);
    expect((await request(app).get(`/api/tickets/${id}`).set(auth('other'))).status).toBe(403);
    expect((await request(app).get(`/api/tickets/${id}`).set(auth('admin'))).status).toBe(200);
  });

  it('hold-expiry job cancels stale pending tickets (SQLite created_at comparison)', async () => {
    const eid = await newEvent(5);
    const r = await request(app).post(`/api/events/${eid}/tickets`).send({ holder_name: 'G', holder_email: 'g@em.test' });
    await getDb()('tickets').where({ id: r.body.ticket.id }).update({ created_at: OLD });
    expect(await expirePendingTickets()).toBeGreaterThanOrEqual(1);
    expect((await getDb()('tickets').where({ id: r.body.ticket.id }).first()).status).toBe('cancelled');
  });

  it('late payment for an expired ticket re-issues the seat if free and is booked exactly once', async () => {
    const eid = await newEvent(1);
    const r = await request(app).post(`/api/events/${eid}/tickets`).send({ holder_name: 'Late', holder_email: 'late@em.test' });
    await getDb()('tickets').where({ id: r.body.ticket.id }).update({ status: 'cancelled' });
    await webhook(r.body.checkout.order_id, 'pay_late_t1', 250);
    expect((await getDb()('tickets').where({ id: r.body.ticket.id }).first()).status).toBe('confirmed');
    expect(await ledgerFor(r.body.ticket.payment_id)).toHaveLength(1);
  });

  it('late payment for an expired ticket on a full event stays cancelled but still reaches the ledger', async () => {
    const eid = await newEvent(1);
    const a = await request(app).post(`/api/events/${eid}/tickets`).send({ holder_name: 'A', holder_email: 'a@em.test' });
    await getDb()('tickets').where({ id: a.body.ticket.id }).update({ status: 'cancelled' });
    const b = await request(app).post(`/api/events/${eid}/tickets`).send({ holder_name: 'B', holder_email: 'b@em.test' });
    expect(b.status).toBe(201); // seat went to B
    await webhook(a.body.checkout.order_id, 'pay_late_t2', 250);
    expect((await getDb()('tickets').where({ id: a.body.ticket.id }).first()).status).toBe('cancelled');
    const entries = await ledgerFor(a.body.ticket.payment_id);
    expect(entries).toHaveLength(1); expect(entries[0].memo).toMatch(/refund due/);
  });

  it('event report revenue is net of reversals', async () => {
    const eid = await newEvent(5);
    const t = await request(app).post(`/api/events/${eid}/cash-ticket`).set(auth('treasurer')).send({ holder_name: 'R', holder_email: 'r@em.test' });
    const [entry] = await ledgerFor(t.body.payment_id);
    expect((await request(app).get(`/api/events/${eid}/report`).set(auth('admin'))).body.revenue).toBe(250);
    expect((await request(app).post(`/api/finance/ledger/${entry.id}/reverse`).set(auth('treasurer')).send({ memo: 'refunded' })).status).toBe(201);
    const rep = (await request(app).get(`/api/events/${eid}/report`).set(auth('admin'))).body;
    expect(rep.revenue).toBe(0); expect(rep.spent).toBe(0);
  });

  it('empty PATCH is a no-op, unknown id is 404', async () => {
    const eid = await newEvent(5);
    expect((await request(app).patch(`/api/events/${eid}`).set(auth('admin')).send({})).status).toBe(200);
    expect((await request(app).patch('/api/events/999999').set(auth('admin')).send({})).status).toBe(404);
  });

  it('double scan reports a readable timestamp', async () => {
    const eid = await newEvent(5);
    const t = await request(app).post(`/api/events/${eid}/cash-ticket`).set(auth('treasurer')).send({ holder_name: 'S', holder_email: 's@em.test' });
    expect((await request(app).post('/api/checkin').set(auth('volunteer')).send({ qr_token: t.body.qr_token })).status).toBe(200);
    const again = await request(app).post('/api/checkin').set(auth('volunteer')).send({ qr_token: t.body.qr_token });
    expect(again.status).toBe(409); expect(again.body.reason).toMatch(/^Already used at \d{4}-\d{2}-\d{2}T/);
  });
});

describe('merchandise', () => {
  let variantId: number; let productId: number;
  beforeAll(async () => {
    const p = await request(app).post('/api/products').set(auth('admin')).send({ name: 'Cap', variants: [{ size: 'OS', price: 0.1, member_price: 0.1, stock: 10 }] });
    productId = p.body.id;
    variantId = (await getDb()('product_variants').where({ product_id: productId }).first()).id;
  });

  it('order totals are exact in paise', async () => {
    const o = await request(app).post('/api/orders').set(auth('other')).send({ items: [{ variant_id: variantId, qty: 3 }] });
    expect(o.status).toBe(201); expect(Number(o.body.order.total)).toBe(0.3); expect(o.body.checkout.amount).toBe(0.3);
  });

  it('stock cannot be set below reserved; unknown variant is 404', async () => {
    expect((await request(app).patch(`/api/variants/${variantId}`).set(auth('admin')).send({ stock: 1 })).status).toBe(409);
    expect((await request(app).patch(`/api/variants/${variantId}`).set(auth('admin')).send({ stock: 10 })).status).toBe(200);
    expect((await request(app).patch('/api/variants/999999').set(auth('admin')).send({ stock: 1 })).status).toBe(404);
  });

  it('inactive products cannot be ordered', async () => {
    const p = await request(app).post('/api/products').set(auth('admin')).send({ name: 'Old tee', is_active: false, variants: [{ size: 'M', price: 5, member_price: 5, stock: 3 }] });
    const v = await getDb()('product_variants').where({ product_id: p.body.id }).first();
    expect((await request(app).post('/api/orders').set(auth('other')).send({ items: [{ variant_id: v.id, qty: 1 }] })).status).toBe(404);
  });

  it('expiry job releases reserved stock; a late payment then sells from free stock and is booked once', async () => {
    const o = await request(app).post('/api/orders').set(auth('other')).send({ items: [{ variant_id: variantId, qty: 2 }] });
    const before = await getDb()('product_variants').where({ id: variantId }).first();
    await getDb()('orders').where({ id: o.body.order.id }).update({ created_at: OLD });
    await expirePendingOrders();
    const released = await getDb()('product_variants').where({ id: variantId }).first();
    expect((await getDb()('orders').where({ id: o.body.order.id }).first()).status).toBe('cancelled');
    expect(released.reserved).toBe(before.reserved - 2);
    await webhook(o.body.checkout.order_id, 'pay_late_o1', 0.2);
    const after = await getDb()('product_variants').where({ id: variantId }).first();
    expect((await getDb()('orders').where({ id: o.body.order.id }).first()).status).toBe('paid');
    expect(after.stock).toBe(released.stock - 2); expect(after.reserved).toBe(released.reserved);
    expect(await ledgerFor(o.body.order.payment_id)).toHaveLength(1);
  });

  it('a payment-gateway failure (now outside the row locks) releases the held seat and stock immediately', async () => {
    const eid = await newEvent(1);
    const spy = vi.spyOn(paymentProvider, 'createOrder').mockRejectedValue(new Error('gateway down'));
    try {
      expect((await request(app).post(`/api/events/${eid}/tickets`).send({ holder_name: 'X', holder_email: 'x@em.test' })).status).toBe(500);
      const before = await getDb()('product_variants').where({ id: variantId }).first();
      expect((await request(app).post('/api/orders').set(auth('other')).send({ items: [{ variant_id: variantId, qty: 1 }] })).status).toBe(500);
      expect((await getDb()('product_variants').where({ id: variantId }).first()).reserved).toBe(before.reserved);
    } finally { spy.mockRestore(); }
    expect((await request(app).get(`/api/events/${eid}`)).body.seats_left).toBe(1);
    expect((await request(app).post(`/api/events/${eid}/tickets`).send({ holder_name: 'Y', holder_email: 'y@em.test' })).status).toBe(201);
  });
});
