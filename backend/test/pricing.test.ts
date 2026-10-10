import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { freshDb, getDb } from './setup';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { signToken, type Role } from '../src/middleware/auth';

let app: ReturnType<typeof createApp>;
const users: Record<string, { id: number; token: string }> = {};
const auth = (who: string) => ({ Authorization: `Bearer ${users[who].token}` });

async function makeUser(name: string, role: Role, member = false) {
  const db = getDb();
  const [id] = await db('users').insert({ name, email: `${name}@pr.test`, password_hash: 'x', role });
  const [mid] = await db('members').insert({ user_id: id, student_id: `PR-${name}`, joined_at: '2026-01-01' });
  if (member) await db('memberships').insert({ member_id: mid, start_date: '2026-01-01', expiry_date: '2099-06-30', status: 'active' });
  users[name] = { id: id as number, token: signToken({ id: id as number, role, email: `${name}@pr.test` }) };
}
const newEvent = async (body: Record<string, unknown>) => {
  const r = await request(app).post('/api/admin/events').set(auth('admin'))
    .send({ title: `E${Math.random()}`, starts_at: new Date(Date.now() + 864e5).toISOString(), capacity: 10, status: 'published', ...body });
  expect(r.status).toBe(201);
  return r.body.id as number;
};
const register = (eid: number, who: string) => request(app).post(`/api/events/${eid}/register`).set(auth(who));
const pay = (who: string, payment_id: number) => request(app).post(`/api/payments/demo-confirm/${payment_id}`).set(auth(who));

beforeAll(async () => {
  await freshDb();
  (env as any).DEMO_PAYMENTS = true;
  app = createApp();
  await makeUser('admin', 'admin');
  await makeUser('member', 'user', true);
  for (const n of ['guest', 'guest2', 'joiner']) await makeUser(n, 'user');
});

describe('member and non-member ticket prices', () => {
  it('members pay member_price with a member ticket; non-members pay non_member_price with a non_member ticket', async () => {
    const eid = await newEvent({ member_price: 99, non_member_price: 199 });
    const m = await register(eid, 'member');
    expect(m.status).toBe(201);
    expect(m.body.ticket).toMatchObject({ ticket_type: 'member', price: 99, status: 'pending' });
    expect(m.body.checkout.amount).toBe(99);
    const g = await register(eid, 'guest');
    expect(g.status).toBe(201);
    expect(g.body.ticket).toMatchObject({ ticket_type: 'non_member', price: 199 });
    expect(g.body.checkout.amount).toBe(199);
    expect((await pay('guest', g.body.checkout.payment_id)).status).toBe(200);
    expect((await request(app).get(`/api/tickets/${g.body.ticket.id}`).set(auth('guest'))).body.status).toBe('confirmed');
  });

  it('shows each caller the price they would pay', async () => {
    const eid = await newEvent({ member_price: 299, non_member_price: 499 });
    const as = async (who?: string) => (await (who ? request(app).get(`/api/events/${eid}`).set(auth(who)) : request(app).get(`/api/events/${eid}`))).body;
    expect(await as('member')).toMatchObject({ member_price: 299, non_member_price: 499, members_only: false, price_for_you: 299 });
    expect((await as('guest')).price_for_you).toBe(499);
    expect((await as()).price_for_you).toBe(499);
    const only = await newEvent({ member_price: 0, members_only: true });
    expect((await request(app).get(`/api/events/${only}`).set(auth('guest'))).body).toMatchObject({ members_only: true, price_for_you: null });
  });

  it('a free-for-members event can still charge non-members', async () => {
    const eid = await newEvent({ member_price: 0, non_member_price: 49 });
    const m = await register(eid, 'member');
    expect(m.body).toMatchObject({ checkout: null, ticket: { status: 'confirmed', price: 0, ticket_type: 'member' } });
    const g = await register(eid, 'guest2');
    expect(g.body.ticket).toMatchObject({ status: 'pending', price: 49, ticket_type: 'non_member' });
  });

  it('members_only events keep the hard gate for non-members', async () => {
    const eid = await newEvent({ member_price: 0, non_member_price: 100, members_only: true });
    const nm = await register(eid, 'guest');
    expect(nm.status).toBe(403);
    expect(nm.body.code).toBe('MEMBERSHIP_REQUIRED');
    expect(nm.body.membership.price).toBe(500);
    expect((await register(eid, 'member')).status).toBe(201);
    // The flag can be switched off later.
    await request(app).patch(`/api/admin/events/${eid}`).set(auth('admin')).send({ members_only: false });
    expect((await register(eid, 'guest')).body.ticket).toMatchObject({ ticket_type: 'non_member', price: 100 });
  });

  it('re-prices a held seat when a non-member joins before paying', async () => {
    const eid = await newEvent({ member_price: 99, non_member_price: 199 });
    const first = await register(eid, 'joiner');
    expect(first.body.ticket).toMatchObject({ ticket_type: 'non_member', price: 199 });
    // Same price: resumes the same checkout.
    const again = await register(eid, 'joiner');
    expect(again.status).toBe(200);
    expect(again.body.checkout.payment_id).toBe(first.body.checkout.payment_id);
    // Becomes a member, then registers again: member price on the same ticket, and the old checkout is dropped.
    const ms = await request(app).post('/api/memberships').set(auth('joiner')).send({});
    expect((await pay('joiner', ms.body.checkout.payment_id)).status).toBe(200);
    const member = await register(eid, 'joiner');
    expect(member.status).toBe(201);
    expect(member.body.ticket).toMatchObject({ id: first.body.ticket.id, ticket_type: 'member', price: 99 });
    expect(member.body.checkout.amount).toBe(99);
    expect((await getDb()('payments').where({ id: first.body.checkout.payment_id }).first()).status).toBe('failed');
    expect(await getDb()('tickets').where({ event_id: eid }).count({ n: '*' })).toEqual([{ n: 1 }]);
  });
});

describe('event report', () => {
  it('splits attendance and revenue by member and non-member', async () => {
    const eid = await newEvent({ member_price: 100, non_member_price: 250 });
    await makeUser('m2', 'user', true);
    await makeUser('g3', 'user');
    await makeUser('g4', 'user');
    const tickets: Record<string, any> = {};
    for (const who of ['member', 'm2', 'g3', 'g4']) {
      const r = await register(eid, who);
      expect((await pay(who, r.body.checkout.payment_id)).status).toBe(200);
      tickets[who] = (await request(app).get(`/api/tickets/${r.body.ticket.id}`).set(auth(who))).body;
    }
    // One member and one non-member at the door; one non-member cancels (refunded, so not revenue).
    for (const who of ['member', 'g3']) expect((await request(app).post('/api/admin/checkin').set(auth('admin')).send({ qr_token: tickets[who].qr_token, event_id: eid })).body.ok).toBe(true);
    expect((await request(app).delete(`/api/events/${eid}/register`).set(auth('g4'))).status).toBe(200);

    const r = (await request(app).get(`/api/admin/events/${eid}/report`).set(auth('admin'))).body;
    expect(r.split).toEqual({ member: { sold: 2, checked_in: 1, revenue: 200 }, non_member: { sold: 1, checked_in: 1, revenue: 250 } });
    expect(r.by_type).toEqual({ member: 2, non_member: 1 });
    expect(r).toMatchObject({ sold: 3, checked_in: 2, cancelled: 1, revenue: 450 });
  });
});

describe('event_members_only migration', () => {
  it('keeps events that already existed members-only; new events default to open', async () => {
    const db = await freshDb();
    const name = '20261014000000_event_members_only.ts';
    await db.migrate.down({ name });
    await db('events').insert({ title: 'old', starts_at: new Date(), capacity: 5, member_price: 299 });
    await db.migrate.up({ name });
    expect(!!(await db('events').where({ title: 'old' }).first()).members_only).toBe(true);
    await db('events').insert({ title: 'new', starts_at: new Date(), capacity: 5 });
    expect(!!(await db('events').where({ title: 'new' }).first()).members_only).toBe(false);
  });
});
