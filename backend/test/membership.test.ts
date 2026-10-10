import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { freshDb, getDb } from './setup';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { signToken, type Role } from '../src/middleware/auth';
import { addDaysYmd, todayYmd } from '../src/lib/dates';

let app: ReturnType<typeof createApp>;
const users: Record<string, { id: number; member_id: number; token: string }> = {};
const auth = (who: string) => ({ Authorization: `Bearer ${users[who].token}` });

/** A user with a member profile and, optionally, an active paid membership ending `expiresInDays` from today. */
async function makeUser(name: string, role: Role, expiresInDays?: number) {
  const db = getDb();
  const [id] = await db('users').insert({ name, email: `${name}@ms.test`, password_hash: 'x', role });
  const [member_id] = await db('members').insert({ user_id: id, student_id: `MS-${name}`, joined_at: '2026-01-01' });
  if (expiresInDays != null) {
    const [payment_id] = await db('payments').insert({ user_id: id, amount: 500, purpose: 'dues', reference_type: 'membership', reference_id: 0, provider: 'cash', status: 'paid', paid_at: new Date(), provider_payment_id: `cash_${name}` });
    await db('memberships').insert({ member_id, start_date: addDaysYmd(todayYmd(), -300), expiry_date: addDaysYmd(todayYmd(), expiresInDays), status: 'active', payment_id });
  }
  users[name] = { id: id as number, member_id: member_id as number, token: signToken({ id: id as number, role, email: `${name}@ms.test` }) };
}

beforeAll(async () => {
  await freshDb();
  (env as any).DEMO_PAYMENTS = true;
  app = createApp();
  await makeUser('admin', 'admin');
  await makeUser('soon', 'user', 10);     // inside the renewal window
  await makeUser('later', 'user', 200);   // well covered
  await makeUser('none', 'user');         // profile, never paid
});

describe('membership dues, status and renewal', () => {
  it('shows status, days left, renewal eligibility and dues history on /me', async () => {
    const soon = (await request(app).get('/api/me').set(auth('soon'))).body;
    expect(soon.is_member).toBe(true);
    expect(soon.days_left).toBe(10);
    expect(soon.can_renew).toBe(true);
    expect(soon.dues).toEqual([expect.objectContaining({ amount: 500, method: 'cash', paid: true, status: 'active' })]);
    const later = (await request(app).get('/api/me').set(auth('later'))).body;
    expect(later.can_renew).toBe(false);
    const none = (await request(app).get('/api/me').set(auth('none'))).body;
    expect(none.is_member).toBe(false);
    expect(none.can_renew).toBe(true);
    expect(none.dues).toEqual([]);
  });

  it('lets a member renew online inside the window, starting the day after the current period', async () => {
    expect((await request(app).post('/api/memberships').set(auth('later')).send({})).body.code).toBe('ALREADY_MEMBER');
    const r = await request(app).post('/api/memberships').set(auth('soon')).send({});
    expect(r.status).toBe(201);
    expect((await request(app).post(`/api/payments/demo-confirm/${r.body.checkout.payment_id}`).set(auth('soon'))).status).toBe(200);
    const me = (await request(app).get('/api/me').set(auth('soon'))).body;
    // Covered through the renewal now; it starts the day after the current period ends.
    expect(me.renewal).toEqual({ start_date: addDaysYmd(todayYmd(), 11), expiry_date: expect.any(String) });
    expect(me.membership_expires).toBe(me.renewal.expiry_date);
    expect(me.days_left).toBeGreaterThan(30);
    expect(me.can_renew).toBe(false);
    expect(me.dues).toHaveLength(2);
    expect(me.dues[0]).toMatchObject({ method: 'online', paid: true, amount: 500 });
  });

  it('shows dues in the admin members list and history', async () => {
    const list = (await request(app).get('/api/admin/members').set(auth('admin'))).body;
    const later = list.find((m: any) => m.email === 'later@ms.test');
    expect(later).toMatchObject({ dues_status: 'paid', dues_provider: 'cash' });
    expect(Number(later.dues_amount)).toBe(500);
    expect(list.find((m: any) => m.email === 'none@ms.test').dues_status).toBeNull();
    const hist = (await request(app).get(`/api/admin/members/${users.later.member_id}/dues`).set(auth('admin'))).body;
    expect(hist).toHaveLength(1);
  });

  it('lets an admin set the expiry date of a paid membership', async () => {
    const target = addDaysYmd(todayYmd(), 400);
    const r = await request(app).patch(`/api/admin/members/${users.later.member_id}/membership`).set(auth('admin')).send({ expiry_date: target });
    expect(r.status).toBe(200);
    expect((await request(app).get('/api/me').set(auth('later'))).body.membership_expires).toBe(target);
    expect((await request(app).patch(`/api/admin/members/${users.later.member_id}/membership`).set(auth('admin')).send({ expiry_date: '2020-01-01' })).status).toBe(400);
    // No paid membership: nothing to change (record dues instead).
    expect((await request(app).patch(`/api/admin/members/${users.none.member_id}/membership`).set(auth('admin')).send({ expiry_date: target })).status).toBe(400);
    // Users can't set their own expiry.
    expect((await request(app).patch(`/api/admin/members/${users.later.member_id}/membership`).set(auth('later')).send({ expiry_date: target })).status).toBe(403);
  });

  it('lets an admin send a renewal reminder now', async () => {
    const r = await request(app).post(`/api/admin/members/${users.later.member_id}/remind`).set(auth('admin'));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sent: true, email: 'later@ms.test' });
    expect((await request(app).post(`/api/admin/members/${users.none.member_id}/remind`).set(auth('admin'))).status).toBe(400);
  });
});

describe('renewal reminder job', () => {
  it('reminds members expiring within 14 days, but not ones who already renewed', async () => {
    const { sendRenewalReminders } = await import('../src/jobs');
    await makeUser('remindme', 'user', 5);
    const sent = await sendRenewalReminders();
    const db = getDb();
    const stamped = await db('memberships as ms').join('members as m', 'm.id', 'ms.member_id').whereNotNull('ms.reminder_sent_at').pluck('m.student_id');
    expect(stamped).toContain('MS-remindme');
    expect(stamped).not.toContain('MS-soon'); // renewed ahead in the test above
    expect(sent).toBeGreaterThanOrEqual(1);
  });
});
