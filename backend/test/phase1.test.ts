import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import knex from 'knex';
import { freshDb, getDb } from './setup';
import { buildConfig } from '../src/config/knexfile';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { signToken, type Role } from '../src/middleware/auth';
import { adminRouter } from '../src/modules/admin/routes';

let app: ReturnType<typeof createApp>;
const users: Record<string, { id: number; token: string }> = {};
const auth = (who: string) => ({ Authorization: `Bearer ${users[who].token}` });
const setDemo = (on: boolean) => { (env as any).DEMO_PAYMENTS = on; };

async function makeUser(name: string, role: Role, member = false) {
  const db = getDb();
  const [id] = await db('users').insert({ name, email: `${name}@p1.test`, password_hash: 'x', role });
  const [mid] = await db('members').insert({ user_id: id, student_id: `P1-${name}`, joined_at: '2026-01-01' });
  if (member) await db('memberships').insert({ member_id: mid, start_date: '2026-01-01', expiry_date: '2099-06-30', status: 'active' });
  users[name] = { id: id as number, token: signToken({ id: id as number, role, email: `${name}@p1.test` }) };
}

const newEvent = async (capacity: number, member_price = 0) => {
  const r = await request(app).post('/api/admin/events').set(auth('admin'))
    .send({ title: `E${Math.random()}`, starts_at: new Date(Date.now() + 864e5).toISOString(), capacity, member_price, status: 'published' });
  expect(r.status).toBe(201);
  return r.body.id as number;
};
const ledgerFor = (payment_id: number) => getDb()('ledger_entries').where({ source_type: 'payment', source_id: payment_id });

beforeAll(async () => {
  await freshDb();
  app = createApp();
  await makeUser('admin', 'admin');
  await makeUser('admin2', 'admin');
  await makeUser('member', 'user', true);
  await makeUser('student', 'user');
  for (let i = 0; i < 8; i++) await makeUser(`crowd${i}`, 'user', true);
});
afterAll(() => setDemo(false));

describe('two-role migration', () => {
  it('maps admin, treasurer → admin and volunteer, member → user; down() maps back; the CHECK and unique email survive', async () => {
    const db = knex({ ...buildConfig(''), connection: { filename: ':memory:' } });
    try {
      await db.migrate.up({ name: '20261010000000_init.ts' });
      await db.migrate.up({ name: '20261011000100_payment_order_index_receipt_longtext.ts' });
      for (const role of ['admin', 'treasurer', 'volunteer', 'member']) await db('users').insert({ name: role, email: `${role}@m.test`, password_hash: 'x', role });
      const [eid] = await db('events').insert({ title: 'e', starts_at: new Date(), capacity: 5 });
      const t = { event_id: eid, holder_user_id: 4, holder_name: 'm', holder_email: 'm@m.test', ticket_type: 'member', price: 0 };
      await db('tickets').insert([{ ...t, status: 'confirmed' }, { ...t, status: 'cancelled' }]);

      await db.migrate.latest();
      const roles = Object.fromEntries((await db('users').select('email', 'role')).map((u) => [u.email, u.role]));
      expect(roles).toEqual({ 'admin@m.test': 'admin', 'treasurer@m.test': 'admin', 'volunteer@m.test': 'user', 'member@m.test': 'user' });
      await expect(db('users').insert({ name: 'x', email: 'x@m.test', password_hash: 'x', role: 'member' })).rejects.toThrow(/CHECK/);
      await expect(db('users').insert({ name: 'x', email: 'admin@m.test', password_hash: 'x', role: 'user' })).rejects.toThrow(/UNIQUE/);
      // The duplicate ticket is kept but detached; the confirmed one stays on the account.
      expect(await db('tickets').where({ holder_user_id: 4 }).pluck('status')).toEqual(['confirmed']);
      expect(await db('tickets').count({ n: '*' })).toEqual([{ n: 2 }]);
      await expect(db('tickets').insert({ ...t, status: 'pending' })).rejects.toThrow(/UNIQUE/);

      await db.migrate.down();
      const back = Object.fromEntries((await db('users').select('email', 'role')).map((u) => [u.email, u.role]));
      expect(back).toEqual({ 'admin@m.test': 'admin', 'treasurer@m.test': 'admin', 'volunteer@m.test': 'member', 'member@m.test': 'member' });
    } finally {
      await db.destroy();
    }
  });
});

describe('GET /api/me and /api/membership/info', () => {
  it('exposes is_member and membership_expires', async () => {
    const m = (await request(app).get('/api/me').set(auth('member'))).body;
    expect(m.is_member).toBe(true); expect(m.membership_expires).toBe('2099-06-30');
    const s = (await request(app).get('/api/me').set(auth('student'))).body;
    expect(s.is_member).toBe(false); expect(s.membership_expires).toBeNull();
  });
  it('membership info is public', async () => {
    const r = await request(app).get('/api/membership/info');
    expect(r.status).toBe(200); expect(r.body.price).toBe(500); expect(r.body.benefits.length).toBeGreaterThan(0); expect(r.body.valid_until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('event registration', () => {
  it('anonymous 401, non-member 403 MEMBERSHIP_REQUIRED (with the offer), member 201, repeat 409 ALREADY_REGISTERED', async () => {
    const eid = await newEvent(5);
    expect((await request(app).post(`/api/events/${eid}/register`)).status).toBe(401);
    const nm = await request(app).post(`/api/events/${eid}/register`).set(auth('student'));
    expect(nm.status).toBe(403); expect(nm.body.code).toBe('MEMBERSHIP_REQUIRED');
    expect(nm.body.membership).toMatchObject({ price: 500 }); expect(nm.body.membership.benefits.length).toBeGreaterThan(0); expect(nm.body.message).toBeTruthy();
    const ok = await request(app).post(`/api/events/${eid}/register`).set(auth('member'));
    expect(ok.status).toBe(201); expect(ok.body.ticket.status).toBe('confirmed'); expect(ok.body.ticket.qr_token).toBeTruthy(); expect(ok.body.checkout).toBeNull();
    const again = await request(app).post(`/api/events/${eid}/register`).set(auth('member'));
    expect(again.status).toBe(409); expect(again.body.code).toBe('ALREADY_REGISTERED');
  });

  it('a full event is 409 SOLD_OUT', async () => {
    const eid = await newEvent(1);
    expect((await request(app).post(`/api/events/${eid}/register`).set(auth('crowd0'))).status).toBe(201);
    const full = await request(app).post(`/api/events/${eid}/register`).set(auth('member'));
    expect(full.status).toBe(409); expect(full.body.code).toBe('SOLD_OUT');
  });

  it('concurrent registrations never exceed capacity', async () => {
    const eid = await newEvent(3);
    const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => request(app).post(`/api/events/${eid}/register`).set(auth(`crowd${i}`))));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(3);
    expect(rs.filter((r) => r.status === 409 && r.body.code === 'SOLD_OUT')).toHaveLength(5);
    expect(await getDb()('tickets').where({ event_id: eid }).whereIn('status', ['pending', 'confirmed', 'checked_in']).count({ n: '*' })).toEqual([{ n: 3 }]);
    expect((await request(app).get(`/api/events/${eid}`)).body.seats_left).toBe(0);
  });

  it('events carry seats_left and a viewer block for the caller', async () => {
    const eid = await newEvent(4);
    await request(app).post(`/api/events/${eid}/register`).set(auth('member'));
    expect((await request(app).get(`/api/events/${eid}`).set(auth('member'))).body).toMatchObject({ seats_left: 3, viewer: { logged_in: true, is_member: true, registered: true } });
    expect((await request(app).get(`/api/events/${eid}`).set(auth('student'))).body.viewer).toMatchObject({ logged_in: true, is_member: false, registered: false });
    expect((await request(app).get(`/api/events/${eid}`)).body.viewer).toMatchObject({ logged_in: false, registered: false });
  });

  it('the holder can cancel before the start; the seat is freed and re-registering reuses the ticket row', async () => {
    const eid = await newEvent(1);
    const a = await request(app).post(`/api/events/${eid}/register`).set(auth('member'));
    const c = await request(app).delete(`/api/events/${eid}/register`).set(auth('member'));
    expect(c.status).toBe(200); expect(c.body.status).toBe('cancelled');
    expect((await request(app).get(`/api/events/${eid}`)).body.seats_left).toBe(1);
    expect((await request(app).delete(`/api/events/${eid}/register`).set(auth('member'))).status).toBe(404);
    const b = await request(app).post(`/api/events/${eid}/register`).set(auth('member'));
    expect(b.status).toBe(201); expect(b.body.ticket.id).toBe(a.body.ticket.id); expect(b.body.ticket.status).toBe('confirmed');
  });

  it('a paid event holds the seat as pending; demo-confirm confirms it and writes one ledger row; cancelling reverses it', async () => {
    setDemo(true);
    const eid = await newEvent(2, 150);
    const r = await request(app).post(`/api/events/${eid}/register`).set(auth('member'));
    expect(r.status).toBe(201); expect(r.body.ticket.status).toBe('pending'); expect(r.body.checkout).toMatchObject({ amount: 150, demo: true });
    // Registering again resumes the same checkout instead of opening a second one.
    const resumed = await request(app).post(`/api/events/${eid}/register`).set(auth('member'));
    expect(resumed.status).toBe(200); expect(resumed.body.checkout.payment_id).toBe(r.body.checkout.payment_id);
    const pid = r.body.checkout.payment_id;
    expect((await request(app).post(`/api/payments/demo-confirm/${pid}`).set(auth('member'))).body.result).toBe('confirmed');
    expect((await getDb()('tickets').where({ id: r.body.ticket.id }).first()).status).toBe('confirmed');
    expect(await ledgerFor(pid)).toHaveLength(1);
    expect((await request(app).delete(`/api/events/${eid}/register`).set(auth('member'))).status).toBe(200);
    expect(await getDb()('ledger_entries').where({ source_type: 'reversal' }).whereIn('source_id', (await ledgerFor(pid)).map((e) => e.id))).toHaveLength(1);
    expect((await getDb()('payments').where({ id: pid }).first()).status).toBe('refunded');
    setDemo(false);
  });

  it('the old purchase routes are gone', async () => {
    const eid = await newEvent(5);
    expect((await request(app).post(`/api/events/${eid}/tickets`).set(auth('member')).send({})).status).toBe(404);
    expect((await request(app).post(`/api/events/${eid}/cash-ticket`).set(auth('admin')).send({})).status).toBe(404);
  });
});

describe('buying a membership (demo payments)', () => {
  it('demo-confirm is 404 while DEMO_PAYMENTS is off, for everyone', async () => {
    setDemo(false);
    expect((await request(app).post('/api/payments/demo-confirm/1').set(auth('student'))).status).toBe(404);
    expect((await request(app).post('/api/payments/demo-confirm/1')).status).toBe(404);
  });

  it('activates the membership and writes exactly one ledger row; only the payer can confirm', async () => {
    setDemo(true);
    const r = await request(app).post('/api/memberships').set(auth('student')).send({});
    expect(r.status).toBe(201); expect(r.body.checkout).toMatchObject({ amount: 500, demo: true });
    const pid = r.body.checkout.payment_id;
    expect((await request(app).post(`/api/payments/demo-confirm/${pid}`).set(auth('member'))).status).toBe(403);
    expect((await request(app).post(`/api/payments/demo-confirm/${pid}`).set(auth('student'))).body.result).toBe('confirmed');
    expect((await request(app).post(`/api/payments/demo-confirm/${pid}`).set(auth('student'))).body.result).toBe('already_paid');
    expect(await ledgerFor(pid)).toHaveLength(1);
    expect((await request(app).get('/api/me').set(auth('student'))).body.is_member).toBe(true);
    // …and the student can now register.
    expect((await request(app).post(`/api/events/${await newEvent(5)}/register`).set(auth('student'))).status).toBe(201);
    setDemo(false);
  });

  it('a user without a member profile gives their student ID with the purchase', async () => {
    const [id] = await getDb()('users').insert({ name: 'nop', email: 'nop@p1.test', password_hash: 'x', role: 'user' });
    const tok = { Authorization: `Bearer ${signToken({ id: id as number, role: 'user', email: 'nop@p1.test' })}` };
    expect((await request(app).post('/api/memberships').set(tok).send({})).body.code).toBe('PROFILE_REQUIRED');
    expect((await request(app).post('/api/memberships').set(tok).send({ student_id: 'P1-member' })).status).toBe(409);
    expect((await request(app).post('/api/memberships').set(tok).send({ student_id: 'NOP-1' })).status).toBe(201);
  });
});

describe('merch orders', () => {
  let variantId: number;
  const variant = () => getDb()('product_variants').where({ id: variantId }).first();
  const order = async (qty = 1) => (await request(app).post('/api/orders').set(auth('member')).send({ items: [{ variant_id: variantId, qty }] })).body;
  const patch = (id: number, status: string) => request(app).patch(`/api/admin/orders/${id}`).set(auth('admin')).send({ status });

  beforeAll(async () => {
    const p = await request(app).post('/api/admin/products').set(auth('admin')).send({ name: 'Tee', variants: [{ size: 'M', price: 499, member_price: 449, stock: 10 }] });
    variantId = (await getDb()('product_variants').where({ product_id: p.body.id }).first()).id;
  });

  it('creating an order reserves stock at the member price', async () => {
    const before = await variant();
    const o = await order(2);
    expect(Number(o.order.total)).toBe(898); expect(o.checkout.amount).toBe(898);
    const after = await variant();
    expect(after.reserved).toBe(before.reserved + 2); expect(after.stock).toBe(before.stock);
  });

  it('payment confirmation decrements stock, releases the reservation and writes one ledger row', async () => {
    setDemo(true);
    const o = await order(1);
    const before = await variant();
    expect((await request(app).post(`/api/payments/demo-confirm/${o.checkout.payment_id}`).set(auth('member'))).body.result).toBe('confirmed');
    const after = await variant();
    expect(after.stock).toBe(before.stock - 1); expect(after.reserved).toBe(before.reserved - 1);
    expect((await getDb()('orders').where({ id: o.order.id }).first()).status).toBe('paid');
    expect(await ledgerFor(o.checkout.payment_id)).toHaveLength(1);
    setDemo(false);
  });

  it('accepts only valid status transitions', async () => {
    const o = await order(1);
    expect((await patch(o.order.id, 'fulfilled')).body.code).toBe('INVALID_TRANSITION');
    expect((await patch(o.order.id, 'pending')).status).toBe(400); // not a target state
    const paid = await patch(o.order.id, 'paid'); // admin records cash
    expect(paid.status).toBe(200); expect(paid.body.status).toBe('paid'); expect(paid.body.payment_status).toBe('paid');
    expect((await ledgerFor(o.order.payment_id))[0].entered_by).toBe(users.admin.id);
    expect((await patch(o.order.id, 'paid')).status).toBe(409);
    expect((await patch(o.order.id, 'fulfilled')).body.status).toBe('fulfilled');
    expect((await patch(o.order.id, 'paid')).status).toBe(409);
    expect((await patch(o.order.id, 'cancelled')).body.status).toBe('cancelled');
    expect((await patch(o.order.id, 'paid')).status).toBe(409);
    expect((await patch(999999, 'paid')).status).toBe(404);
  });

  it('cancelling a paid order restocks and writes a reversing entry; cancelling a pending one releases the reservation', async () => {
    const o = await order(3);
    await patch(o.order.id, 'paid');
    const before = await variant();
    expect((await patch(o.order.id, 'cancelled')).status).toBe(200);
    expect((await variant()).stock).toBe(before.stock + 3);
    const [entry] = await ledgerFor(o.order.payment_id);
    const rev = await getDb()('ledger_entries').where({ source_type: 'reversal', source_id: entry.id }).first();
    expect(rev.direction).toBe('out'); expect(Number(rev.amount)).toBe(Number(entry.amount));
    expect((await getDb()('payments').where({ id: o.order.payment_id }).first()).status).toBe('refunded');

    const p = await order(2);
    const held = await variant();
    await patch(p.order.id, 'cancelled');
    expect((await variant()).reserved).toBe(held.reserved - 2);
    expect(await getDb()('ledger_entries').where({ source_type: 'payment', source_id: p.order.payment_id })).toHaveLength(0);
  });

  it('users see only their own orders; the admin table filters, searches and paginates', async () => {
    const mine = (await request(app).get('/api/orders/mine').set(auth('member'))).body;
    expect(mine.length).toBeGreaterThan(0); expect(mine[0].items[0]).toMatchObject({ product: 'Tee', size: 'M' });
    expect((await request(app).get('/api/orders/mine').set(auth('student'))).body).toEqual([]);
    expect((await request(app).get(`/api/orders/${mine[0].id}`).set(auth('student'))).status).toBe(403);
    const page = (await request(app).get('/api/admin/orders?page_size=2').set(auth('admin'))).body;
    expect(page.rows).toHaveLength(2); expect(page.total).toBeGreaterThan(2);
    expect(page.rows[0]).toMatchObject({ customer: { name: 'member', email: 'member@p1.test', is_member: true }, items: [{ product: 'Tee', size: 'M' }] });
    expect(Object.keys(page.rows[0]).sort()).toEqual(['created_at', 'customer', 'id', 'items', 'payment_status', 'status', 'total']);
    const cancelled = (await request(app).get('/api/admin/orders?status=cancelled').set(auth('admin'))).body;
    expect(cancelled.rows.every((r: any) => r.status === 'cancelled')).toBe(true);
    expect((await request(app).get('/api/admin/orders?q=nobody-here').set(auth('admin'))).body.total).toBe(0);
    expect((await request(app).get('/api/admin/orders?q=member@p1').set(auth('admin'))).body.total).toBe(page.total);
  });
});

describe('admin surface', () => {
  /** Every route on the admin router, with params filled in. Checked against the router itself below. */
  const ROUTES: [string, string][] = [
    ['get', '/overview'],
    ['get', '/events'], ['post', '/events'], ['get', '/events/1'], ['patch', '/events/1'], ['get', '/events/1/report'], ['get', '/events/1/registrations'],
    ['post', '/checkin'],
    ['get', '/members'], ['get', '/members/1/verify'], ['post', '/members/1/cash-payment'],
    ['get', '/products'], ['post', '/products'], ['patch', '/products/1'], ['patch', '/variants/1'],
    ['get', '/orders'], ['get', '/orders/stream'], ['patch', '/orders/1'],
    ['post', '/announcements'],
    ['get', '/finance/ledger'], ['post', '/finance/ledger/1/reverse'],
    ['post', '/expenses'], ['get', '/expenses'], ['get', '/expenses/1'], ['patch', '/expenses/1/review'], ['patch', '/expenses/1/pay'],
    ['post', '/fundraisers'], ['patch', '/fundraisers/1'], ['get', '/fundraisers/1/tasks'], ['post', '/fundraisers/1/tasks'], ['post', '/fundraisers/1/cash-income'],
    ['patch', '/tasks/1'],
  ];

  it('the list above covers every admin route', () => {
    const count = (stack: any[]): number => stack.reduce((n, l) => n + (l.route ? Object.keys(l.route.methods).length : l.handle?.stack ? count(l.handle.stack) : 0), 0);
    expect(ROUTES).toHaveLength(count((adminRouter as any).stack));
  });

  it('a non-admin gets 403 and an anonymous caller 401 on every /api/admin/* route', async () => {
    for (const [method, path] of ROUTES) {
      const asUser = await (request(app) as any)[method](`/api/admin${path}`).set(auth('member')).send({});
      expect([method, path, asUser.status]).toEqual([method, path, 403]);
      const anon = await (request(app) as any)[method](`/api/admin${path}`).send({});
      expect([method, path, anon.status]).toEqual([method, path, 401]);
    }
    expect((await request(app).get('/api/admin/does-not-exist').set(auth('member'))).status).toBe(403);
  });

  it('overview has the dashboard headline numbers', async () => {
    const r = await request(app).get('/api/admin/overview').set(auth('admin'));
    expect(r.status).toBe(200);
    expect(r.body.members.active).toBeGreaterThanOrEqual(10); expect(r.body.members.total).toBeGreaterThanOrEqual(r.body.members.active);
    expect(r.body.upcoming_registrations).toBeGreaterThan(0);
    expect(r.body.orders_today.count).toBeGreaterThan(0); expect(r.body.orders_today.revenue).toBeGreaterThan(0);
    expect(typeof r.body.balance).toBe('number');
  });

  it('the admin event list includes drafts; the public one does not', async () => {
    const d = await request(app).post('/api/admin/events').set(auth('admin')).send({ title: 'Secret draft', starts_at: new Date(Date.now() + 864e5).toISOString(), capacity: 5, member_price: 0 });
    expect((await request(app).get('/api/admin/events').set(auth('admin'))).body.some((e: any) => e.id === d.body.id)).toBe(true);
    expect((await request(app).get('/api/events')).body.some((e: any) => e.id === d.body.id)).toBe(false);
  });
});

describe('GET /api/admin/orders/stream (SSE)', () => {
  let server: http.Server; let base: string;
  beforeAll(async () => { server = app.listen(0); await new Promise((r) => server.once('listening', r)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
  afterAll(() => new Promise((r) => server.close(r)));

  const open = (token: string) => new Promise<http.IncomingMessage>((resolve, reject) => http.get(`${base}/api/admin/orders/stream?token=${encodeURIComponent(token)}`, resolve).on('error', reject));

  it('rejects non-admin and invalid tokens', async () => {
    const user = await open(users.member.token); user.resume();
    expect(user.statusCode).toBe(403);
    const bad = await open('not-a-jwt'); bad.resume();
    expect(bad.statusCode).toBe(401);
    const none = await new Promise<http.IncomingMessage>((r) => http.get(`${base}/api/admin/orders/stream`, r)); none.resume();
    expect(none.statusCode).toBe(401);
  });

  it('emits an `order` event when an order is created', async () => {
    const res = await open(users.admin.token);
    expect(res.statusCode).toBe(200); expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    res.setEncoding('utf8');
    let buf = '';
    const got = new Promise<any>((resolve) => res.on('data', (c: string) => {
      buf += c;
      const m = /event: order\ndata: (.+)\n\n/.exec(buf);
      if (m) resolve(JSON.parse(m[1]));
    }));
    await new Promise((r) => setTimeout(r, 20));
    const v = await getDb()('product_variants').first();
    const placed = await request(server).post('/api/orders').set(auth('member')).send({ items: [{ variant_id: v.id, qty: 1 }] });
    expect(placed.status).toBe(201);
    const row = await Promise.race([got, new Promise((_, rej) => setTimeout(() => rej(new Error('no order event within 2s')), 2000))]);
    expect(row).toMatchObject({ id: placed.body.order.id, status: 'pending', customer: { email: 'member@p1.test' } });
    res.destroy();
  });
});
