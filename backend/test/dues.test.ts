import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { freshDb, getDb } from './setup';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import * as email from '../src/lib/logger'; // sendMail logs each email while Resend is off
import { seed } from '../../database/seeds/001_demo';

let app: ReturnType<typeof createApp>;
let admin: { Authorization: string }, admin2: { Authorization: string }, user: { Authorization: string };
const dues = async () => (await request(app).get('/api/admin/dues').set(admin)).body;
const remind = (group: string, ids: number[]) => request(app).post('/api/admin/dues/remind').set(admin).send({ group, ids });

beforeAll(async () => {
  await freshDb();
  (env as any).DEMO_PAYMENTS = true;
  await seed(getDb());
  app = createApp();
  const login = async (e: string, p: string) => ({ Authorization: `Bearer ${(await request(app).post('/api/auth/login').send({ email: e, password: p })).body.token}` });
  admin = await login('admin@skyline.edu', 'Control#Room26');
  admin2 = await login('core@skyline.edu', 'Second#Desk26');
  user = await login('student@skyline.edu', 'Campus#Walk26');
});
afterEach(() => vi.restoreAllMocks());

describe('who owes what', () => {
  it('lists the seed\'s lapsed member, the pending order and totals; members disappear once cash dues are recorded', async () => {
    const d = await dues();
    const kiran = d.memberships_due.rows.find((r: any) => r.email === 'lapsed@skyline.edu');
    expect(kiran).toMatchObject({ name: 'Kiran Rao', status: 'expired', amount: 500 });
    expect(d.memberships_due.rows.find((r: any) => r.email === 'member@skyline.edu')).toBeUndefined(); // active until June
    expect(d.unpaid_orders).toMatchObject({ count: 1, total_amount: 269 });
    expect(d.unpaid_orders.rows[0]).toMatchObject({ name: 'Meera Iyer', amount: 269 });
    expect(d.unpaid_orders.rows[0].minutes_left).toBeGreaterThan(0);
    expect(d.totals.owed_to_club).toBe(d.memberships_due.total_amount + d.unpaid_orders.total_amount + d.unpaid_tickets.total_amount);
    expect(d.totals.owed_by_club).toBe(d.reimbursements_owed.total_amount);

    expect((await request(app).post(`/api/admin/members/${kiran.member_id}/cash-payment`).set(admin).send({ amount: 500 })).status).toBe(201);
    expect((await dues()).memberships_due.rows.find((r: any) => r.email === 'lapsed@skyline.edu')).toBeUndefined();
  });

  it('shows a pending ticket until it is paid', async () => {
    const ev = (await request(app).get('/api/events')).body.find((e: any) => e.title === 'Rhythm Unplugged');
    const r = await request(app).post(`/api/events/${ev.id}/register`).set(user);
    const row = (await dues()).unpaid_tickets.rows.find((t: any) => t.id === r.body.ticket.id);
    expect(row).toMatchObject({ event_title: 'Rhythm Unplugged', amount: 199 });
    await request(app).post(`/api/payments/demo-confirm/${r.body.checkout.payment_id}`).set(user);
    expect((await dues()).unpaid_tickets.rows.find((t: any) => t.id === r.body.ticket.id)).toBeUndefined();
  });

  it('an approved expense is owed by the club until it is paid', async () => {
    const x = (await request(app).post('/api/admin/expenses').set(admin2).send({ amount: 750, category: 'supplies', description: 'Cake boxes' })).body;
    expect((await dues()).reimbursements_owed.rows.find((r: any) => r.id === x.id)).toBeUndefined(); // submitted, not approved yet
    await request(app).patch(`/api/admin/expenses/${x.id}/review`).set(admin).send({ decision: 'approved' });
    const d = await dues();
    expect(d.reimbursements_owed.rows.find((r: any) => r.id === x.id)).toMatchObject({ submitter: 'Core Admin', amount: 750 });
    expect(d.totals.owed_by_club).toBe(750);
    await request(app).patch(`/api/admin/expenses/${x.id}/pay`).set(admin);
    expect((await dues()).reimbursements_owed).toMatchObject({ count: 0, total_amount: 0 });
  });

  it('sends a reminder once per 24 hours; the second is skipped', async () => {
    const spy = vi.spyOn(email.logger, 'info');
    const order = (await dues()).unpaid_orders.rows[0];
    expect((await remind('unpaid_orders', [order.id])).body).toEqual({ sent: 1, skipped: 0 });
    expect((await remind('unpaid_orders', [order.id])).body).toEqual({ sent: 0, skipped: 1 });
    expect(spy.mock.calls.filter((c) => (c[0] as any)?.subject === `Your SSA order #${order.id} is waiting for payment`)).toHaveLength(1);
    // A day later it can go again.
    await getDb()('orders').where({ id: order.id }).update({ last_reminded_at: new Date(Date.now() - 25 * 3600_000) });
    expect((await remind('unpaid_orders', [order.id])).body.sent).toBe(1);
    // Membership reminders work the same way; unknown ids are skipped.
    const [mid] = await getDb()('memberships').insert({ member_id: (await getDb()('members').where({ student_id: 'SKY2026002' }).first()).id, start_date: '2026-01-01', expiry_date: '2026-06-30', status: 'pending' });
    expect((await remind('memberships_due', [mid as number, 999999])).body).toEqual({ sent: 1, skipped: 1 });
    expect((await dues()).memberships_due.rows.find((r: any) => r.id === mid)).toMatchObject({ status: 'pending', reminded_at: expect.anything() });
  });

  it('is admin-only and validates the group', async () => {
    expect((await request(app).get('/api/admin/dues').set(user)).status).toBe(403);
    expect((await request(app).post('/api/admin/dues/remind').set(user).send({ group: 'unpaid_orders', ids: [1] })).status).toBe(403);
    expect((await remind('reimbursements_owed', [1])).status).toBe(400);
    expect((await remind('unpaid_orders', [])).status).toBe(400);
  });

  it('puts the totals on the admin overview', async () => {
    const o = (await request(app).get('/api/admin/overview').set(admin)).body;
    expect(o.dues).toEqual((await dues()).totals);
  });
});
