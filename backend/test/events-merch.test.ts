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
  const people: [string, Role, boolean][] = [['admin', 'admin', false], ['member', 'user', true], ['member2', 'user', true], ['other', 'user', false]];
  for (const [name, role, member] of people) {
    const [id] = await db('users').insert({ name, email: `${name}@em.test`, password_hash: 'x', role });
    users[name] = { id: id as number, token: signToken({ id: id as number, role, email: `${name}@em.test` }) };
    if (!member) continue;
    const [mid] = await db('members').insert({ user_id: id, student_id: `EM-${name}`, joined_at: '2026-01-01' });
    await db('memberships').insert({ member_id: mid, start_date: '2026-01-01', expiry_date: '2099-06-30', status: 'active' });
  }
});

const newEvent = async (capacity: number, extra: Record<string, unknown> = {}) => {
  const r = await request(app).post('/api/admin/events').set(auth('admin'))
    .send({ title: `E${Math.random()}`, starts_at: new Date(Date.now() + 864e5).toISOString(), capacity, member_price: 100, status: 'published', ...extra });
  expect(r.status).toBe(201);
  return r.body.id as number;
};
const register = (eid: number, who = 'member') => request(app).post(`/api/events/${eid}/register`).set(auth(who));

describe('events & tickets', () => {
  it('admins see who registered', async () => {
    const eid = await newEvent(5, { member_price: 0 });
    await register(eid);
    const r = await request(app).get(`/api/admin/events/${eid}/registrations`).set(auth('admin'));
    expect(r.status).toBe(200); expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({ holder_user_id: users.member.id, holder_email: 'member@em.test', status: 'confirmed', payment_status: 'paid' });
  });

  it('only the holder or an admin can read a ticket (and its QR)', async () => {
    const eid = await newEvent(5, { member_price: 0 });
    const r = await register(eid);
    expect(r.body.ticket.status).toBe('confirmed');
    const id = r.body.ticket.id;
    expect((await request(app).get(`/api/tickets/${id}`).set(auth('member'))).status).toBe(200);
    expect((await request(app).get(`/api/tickets/${id}`).set(auth('member2'))).status).toBe(403);
    expect((await request(app).get(`/api/tickets/${id}`).set(auth('other'))).status).toBe(403);
    expect((await request(app).get(`/api/tickets/${id}`).set(auth('admin'))).status).toBe(200);
  });

  it('hold-expiry job cancels stale pending tickets; re-registering restarts the hold window', async () => {
    const eid = await newEvent(5);
    const r = await register(eid);
    await getDb()('tickets').where({ id: r.body.ticket.id }).update({ created_at: OLD });
    expect(await expirePendingTickets()).toBeGreaterThanOrEqual(1);
    expect((await getDb()('tickets').where({ id: r.body.ticket.id }).first()).status).toBe('cancelled');
    const again = await register(eid);
    expect(again.status).toBe(201); expect(again.body.ticket.id).toBe(r.body.ticket.id);
    await expirePendingTickets();
    expect((await getDb()('tickets').where({ id: r.body.ticket.id }).first()).status).toBe('pending');
  });

  it('late payment for an expired ticket re-issues the seat if free and is booked exactly once', async () => {
    const eid = await newEvent(1);
    const r = await register(eid);
    await getDb()('tickets').where({ id: r.body.ticket.id }).update({ status: 'cancelled' });
    await webhook(r.body.checkout.order_id, 'pay_late_t1', 100);
    expect((await getDb()('tickets').where({ id: r.body.ticket.id }).first()).status).toBe('confirmed');
    expect(await ledgerFor(r.body.ticket.payment_id)).toHaveLength(1);
  });

  it('late payment for an expired ticket on a full event stays cancelled but still reaches the ledger', async () => {
    const eid = await newEvent(1);
    const a = await register(eid, 'member');
    await getDb()('tickets').where({ id: a.body.ticket.id }).update({ status: 'cancelled' });
    const b = await register(eid, 'member2');
    expect(b.status).toBe(201); // seat went to member2
    await webhook(a.body.checkout.order_id, 'pay_late_t2', 100);
    expect((await getDb()('tickets').where({ id: a.body.ticket.id }).first()).status).toBe('cancelled');
    const entries = await ledgerFor(a.body.ticket.payment_id);
    expect(entries).toHaveLength(1); expect(entries[0].memo).toMatch(/refund due/);
  });

  it('event report revenue is net of reversals', async () => {
    const eid = await newEvent(5);
    const t = await register(eid);
    await webhook(t.body.checkout.order_id, 'pay_rep', 100);
    const [entry] = await ledgerFor(t.body.checkout.payment_id);
    expect((await request(app).get(`/api/admin/events/${eid}/report`).set(auth('admin'))).body.revenue).toBe(100);
    expect((await request(app).post(`/api/admin/finance/ledger/${entry.id}/reverse`).set(auth('admin')).send({ memo: 'refunded' })).status).toBe(201);
    const rep = (await request(app).get(`/api/admin/events/${eid}/report`).set(auth('admin'))).body;
    expect(rep.revenue).toBe(0); expect(rep.spent).toBe(0);
  });

  it('empty PATCH is a no-op, unknown id is 404', async () => {
    const eid = await newEvent(5);
    expect((await request(app).patch(`/api/admin/events/${eid}`).set(auth('admin')).send({})).status).toBe(200);
    expect((await request(app).patch('/api/admin/events/999999').set(auth('admin')).send({})).status).toBe(404);
  });

  it('registration respects the sales window and the start time', async () => {
    const soon = await newEvent(5, { sales_open_at: new Date(Date.now() + 3600e3).toISOString() });
    expect((await register(soon)).body.code).toBe('REGISTRATION_NOT_OPEN');
    const past = await newEvent(5, { starts_at: new Date(Date.now() - 3600e3).toISOString() });
    expect((await register(past)).body.code).toBe('REGISTRATION_CLOSED');
    const draft = await newEvent(5, { status: 'draft' });
    expect((await register(draft)).status).toBe(404);
  });

  it('double scan reports a readable timestamp', async () => {
    const eid = await newEvent(5, { member_price: 0 });
    const t = await register(eid);
    expect((await request(app).post('/api/admin/checkin').set(auth('admin')).send({ qr_token: t.body.ticket.qr_token })).status).toBe(200);
    const again = await request(app).post('/api/admin/checkin').set(auth('admin')).send({ qr_token: t.body.ticket.qr_token });
    expect(again.status).toBe(409); expect(again.body.reason).toMatch(/^Already used at \d{4}-\d{2}-\d{2}T/);
    expect((await request(app).delete(`/api/events/${eid}/register`).set(auth('member'))).body.code).toBe('ALREADY_CHECKED_IN');
  });
});

describe('merchandise', () => {
  let variantId: number; let productId: number;
  beforeAll(async () => {
    const p = await request(app).post('/api/admin/products').set(auth('admin')).send({ name: 'Cap', variants: [{ size: 'OS', price: 0.1, member_price: 0.1, stock: 10 }] });
    productId = p.body.id;
    variantId = (await getDb()('product_variants').where({ product_id: productId }).first()).id;
  });

  it('order totals are exact in paise', async () => {
    const o = await request(app).post('/api/orders').set(auth('other')).send({ items: [{ variant_id: variantId, qty: 3 }] });
    expect(o.status).toBe(201); expect(Number(o.body.order.total)).toBe(0.3); expect(o.body.checkout.amount).toBe(0.3);
  });

  it('stock cannot be set below reserved; unknown variant is 404', async () => {
    expect((await request(app).patch(`/api/admin/variants/${variantId}`).set(auth('admin')).send({ stock: 1 })).status).toBe(409);
    expect((await request(app).patch(`/api/admin/variants/${variantId}`).set(auth('admin')).send({ stock: 10 })).status).toBe(200);
    expect((await request(app).patch('/api/admin/variants/999999').set(auth('admin')).send({ stock: 1 })).status).toBe(404);
  });

  it('inactive products cannot be ordered', async () => {
    const p = await request(app).post('/api/admin/products').set(auth('admin')).send({ name: 'Old tee', is_active: false, variants: [{ size: 'M', price: 5, member_price: 5, stock: 3 }] });
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
      expect((await register(eid)).status).toBe(500);
      const before = await getDb()('product_variants').where({ id: variantId }).first();
      expect((await request(app).post('/api/orders').set(auth('other')).send({ items: [{ variant_id: variantId, qty: 1 }] })).status).toBe(500);
      expect((await getDb()('product_variants').where({ id: variantId }).first()).reserved).toBe(before.reserved);
    } finally { spy.mockRestore(); }
    expect((await request(app).get(`/api/events/${eid}`)).body.seats_left).toBe(1);
    expect((await register(eid)).status).toBe(201);
  });
});
