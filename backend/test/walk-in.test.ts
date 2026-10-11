import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { freshDb, getDb } from './setup';
import { createApp } from '../src/app';
import { logger } from '../src/lib/logger';
import * as authService from '../src/modules/auth/service';
import { signToken, type Role } from '../src/middleware/auth';

let app: ReturnType<typeof createApp>;
const tokens: Record<string, string> = {};
const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
const walkIn = (body: Record<string, unknown>, who = 'admin') => request(app).post('/api/admin/members/walk-in').set(auth(who)).send(body);
const linkFor = (spy: ReturnType<typeof vi.spyOn>, email: string) => {
  const c = (spy.mock.calls as any[]).find((x) => x[1] === 'set-password link (email not configured)' && x[0].to === email);
  return c ? new URL(c[0].url) : null;
};

beforeAll(async () => {
  await freshDb();
  app = createApp();
  for (const [name, role] of [['admin', 'admin'], ['user', 'user']] as [string, Role][]) {
    const [id] = await getDb()('users').insert({ name, email: `${name}@wi.test`, password_hash: 'x', role });
    tokens[name] = signToken({ id: id as number, role, email: `${name}@wi.test` });
  }
});
afterEach(() => vi.restoreAllMocks());

describe('walk-in sign-up at the table', () => {
  it('with cash: user, member, active membership and exactly one ledger row', async () => {
    const r = await walkIn({ name: 'Asha Walk', email: 'Asha.Walk@wi.test', student_id: 'WI001', phone: '98100', pay_cash: true, amount: 500 });
    expect(r.status).toBe(201);
    expect(r.body.user).toMatchObject({ email: 'asha.walk@wi.test', role: 'user' });
    expect(r.body.member).toMatchObject({ student_id: 'WI001', phone: '98100' });
    expect(r.body.membership).toMatchObject({ status: 'active', expiry_date: expect.stringMatching(/-06-30$/) });
    expect(r.body.qr_token).toBeTruthy();
    expect(r.body.setup_link_sent).toBe(false); // no RESEND_API_KEY in tests: logged, not sent
    const db = getDb();
    const ledger = await db('ledger_entries as l').join('payments as p', 'p.id', 'l.source_id').where('l.source_type', 'payment').where('p.user_id', r.body.user.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ category: 'dues', direction: 'in' });
    expect(Number(ledger[0].amount)).toBe(500);
    expect(await db('audit_logs').where({ action: 'member_walk_in', entity_id: String(r.body.member.id) }).count({ n: '*' })).toEqual([{ n: 1 }]);
    // Shows as active in the members directory.
    const list = (await request(app).get('/api/admin/members?q=WI001').set(auth('admin'))).body;
    expect(list[0]).toMatchObject({ membership_status: 'active', dues_status: 'paid', dues_provider: 'cash' });
  });

  it('without cash: a member profile, no membership and no ledger row', async () => {
    const r = await walkIn({ name: 'No Cash', email: 'nocash@wi.test', student_id: 'WI002', pay_cash: false });
    expect(r.status).toBe(201);
    expect(r.body.membership).toBeNull();
    expect(r.body.qr_token).toBeNull();
    const db = getDb();
    expect(await db('memberships').where({ member_id: r.body.member.id }).count({ n: '*' })).toEqual([{ n: 0 }]);
    expect(await db('payments').where({ user_id: r.body.user.id }).count({ n: '*' })).toEqual([{ n: 0 }]);
  });

  it('defaults the amount to the dues price', async () => {
    const r = await walkIn({ name: 'Default', email: 'default@wi.test', student_id: 'WI003', pay_cash: true });
    expect(Number((await getDb()('payments').where({ user_id: r.body.user.id }).first()).amount)).toBe(500);
  });

  it('rejects a duplicate student ID or email with 409 DUPLICATE_MEMBER naming the field, and creates nothing', async () => {
    const users = async () => Number((await getDb()('users').count({ n: '*' }))[0].n);
    const before = await users();
    const sid = await walkIn({ name: 'Dup', email: 'fresh@wi.test', student_id: 'WI001', pay_cash: true });
    expect(sid.status).toBe(409);
    expect(sid.body).toMatchObject({ code: 'DUPLICATE_MEMBER', field: 'student_id' });
    const mail = await walkIn({ name: 'Dup', email: 'ASHA.walk@wi.test', student_id: 'WI999', pay_cash: false });
    expect(mail.body).toMatchObject({ code: 'DUPLICATE_MEMBER', field: 'email' });
    expect(await users()).toBe(before);
  });

  it('is admin-only and validates input', async () => {
    expect((await walkIn({ name: 'X', email: 'x@wi.test', student_id: 'WI100', pay_cash: false }, 'user')).status).toBe(403);
    expect((await walkIn({ name: 'X', email: 'not-an-email', student_id: 'WI100', pay_cash: false })).status).toBe(400);
    expect((await walkIn({ name: 'X', email: 'x@wi.test', pay_cash: false })).status).toBe(400);
  });

  it('a failed set-password email does not undo the sign-up', async () => {
    const log = vi.spyOn(logger, 'info');
    const err = vi.spyOn(logger, 'error');
    vi.spyOn(authService, 'createPasswordToken').mockRejectedValueOnce(new Error('db hiccup'));
    const r = await walkIn({ name: 'Mail Fail', email: 'mailfail@wi.test', student_id: 'WI004', pay_cash: true });
    expect(r.status).toBe(201);
    expect(r.body.setup_link_sent).toBe(false);
    expect(linkFor(log, 'mailfail@wi.test')).toBeNull();
    expect(err.mock.calls.some((c) => c[1] === 'walk-in: set-password link failed')).toBe(true);
    expect(r.body.membership.status).toBe('active');
    expect(await getDb()('users').where({ email: 'mailfail@wi.test' }).count({ n: '*' })).toEqual([{ n: 1 }]);
  });

  it('the set-password link lets the new member log in and see member prices', async () => {
    const spy = vi.spyOn(logger, 'info');
    await walkIn({ name: 'New Member', email: 'newmember@wi.test', student_id: 'WI005', pay_cash: true, amount: 500 });
    const url = linkFor(spy, 'newmember@wi.test')!;
    expect(url.pathname).toBe('/reset-password');
    expect(url.searchParams.get('setup')).toBe('1');
    // Before setting a password, nothing logs in.
    expect((await request(app).post('/api/auth/login').send({ email: 'newmember@wi.test', password: 'Table#Seat2026' })).status).toBe(401);
    const set = await request(app).post('/api/auth/reset-password').send({ token: url.searchParams.get('token'), password: 'Table#Seat2026' });
    expect(set.body).toMatchObject({ ok: true, purpose: 'setup' });
    const login = await request(app).post('/api/auth/login').send({ email: 'newmember@wi.test', password: 'Table#Seat2026' });
    expect(login.status).toBe(200);
    const me = (await request(app).get('/api/me').set({ Authorization: `Bearer ${login.body.token}` })).body;
    expect(me.is_member).toBe(true);
    const [eid] = await getDb()('events').insert({ title: 'Priced', starts_at: new Date(Date.now() + 864e5), capacity: 5, member_price: 99, non_member_price: 199, status: 'published' });
    expect((await request(app).get(`/api/events/${eid}`).set({ Authorization: `Bearer ${login.body.token}` })).body.price_for_you).toBe(99);
  });
});
