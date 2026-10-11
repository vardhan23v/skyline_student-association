import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { freshDb, getDb } from './setup';
import { createApp } from '../src/app';
import { hmacSha256 } from '../src/lib/hash';
import { env } from '../src/config/env';
import { sendMail } from '../src/lib/email';
import { ymdInTz } from '../src/lib/dates';
import { academicYearEnd } from '../src/modules/memberships/service';
import { expireMemberships } from '../src/jobs';
import { errorHandler } from '../src/middleware/errorHandler';

let app: ReturnType<typeof createApp>;
const tokens: Record<string, string> = {};
const ids: Record<string, number> = {};
const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

const signed = (body: string) =>
  request(app).post('/api/webhooks/payment').set('Content-Type', 'application/json').set('X-Razorpay-Signature', hmacSha256(env.PAYMENT_WEBHOOK_SECRET, body)).send(body);
const captured = (order_id: string, payment_id: string, amount: number) =>
  signed(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: payment_id, order_id, amount: Math.round(amount * 100) } } } }));

beforeAll(async () => {
  await freshDb();
  app = createApp();
  const db = getDb();
  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.hash('Gala#Night7River', 4);
  for (const [name, role] of [['admin', 'admin'], ['admin2', 'admin']]) {
    const [id] = await db('users').insert({ name, email: `${name}@p.test`, password_hash: hash, role });
    ids[name] = id as number;
    tokens[name] = (await request(app).post('/api/auth/login').send({ email: `${name}@p.test`, password: 'Gala#Night7River' })).body.token;
  }
  // `alice` gets member row id 1; `bob` has the numeric student ID "1".
  for (const [name, student_id] of [['alice', 'SKY-A'], ['bob', '1'], ['cara', 'SKY-C']]) {
    const r = await request(app).post('/api/auth/register').send({ name, email: `${name}@p.test`, password: 'Gala#Night7River', student_id });
    tokens[name] = r.body.token; ids[name] = r.body.user.id;
  }
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('online dues', () => {
  it('ignores a client-chosen amount: dues are always the club price', async () => {
    const r = await request(app).post('/api/memberships').set(auth('alice')).send({ amount: 1 });
    expect(r.status).toBe(201);
    expect(r.body.checkout.amount).toBe(500);
    expect((await captured(r.body.checkout.order_id, 'pay_cheap', 1)).body.result).toBe('amount_mismatch');
    expect((await request(app).get('/api/me').set(auth('alice'))).body.active).toBe(false);
  });

  it('reuses the pending membership; a second paid checkout is booked and flagged, not activated twice', async () => {
    const a = await request(app).post('/api/memberships').set(auth('alice')).send({});
    const b = await request(app).post('/api/memberships').set(auth('alice')).send({});
    expect(b.body.membership_id).toBe(a.body.membership_id);
    expect((await captured(a.body.checkout.order_id, 'pay_a', 500)).body.result).toBe('confirmed');
    expect((await captured(b.body.checkout.order_id, 'pay_b', 500)).body.result).toBe('paid_unfulfilled');
    const db = getDb();
    const member = await db('members').where({ user_id: ids.alice }).first();
    expect(await db('memberships').where({ member_id: member.id })).toHaveLength(1);
    // Invariant §4.3(4): both captured payments have exactly one ledger row each.
    const paid = await db('payments').where({ purpose: 'dues', status: 'paid', user_id: ids.alice }).pluck('id');
    expect(paid).toHaveLength(2);
    expect(await db('ledger_entries').where({ source_type: 'payment' }).whereIn('source_id', paid)).toHaveLength(2);
    expect((await request(app).post('/api/memberships').set(auth('alice')).send({})).body.code).toBe('ALREADY_MEMBER');
  });
});

describe('webhook hardening', () => {
  it('signed but malformed JSON → 400; payment without order_id → ignored (no 500 retry loop)', async () => {
    expect((await signed('{not json')).status).toBe(400);
    const r = await signed(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_x', amount: 100 } } } }));
    expect(r.status).toBe(200); expect(r.body.ignored).toBe(true);
  });
  it('does not store large unsigned bodies in full', async () => {
    const junk = 'x'.repeat(100_000);
    expect((await request(app).post('/api/webhooks/payment').set('X-Razorpay-Signature', 'nope').send(junk)).status).toBe(400);
    const row = await getDb()('webhook_events').orderBy('id', 'desc').first();
    expect(row.signature_ok).toBeFalsy(); expect(row.raw_body.length).toBeLessThanOrEqual(2000);
  });
});

describe('cash dues', () => {
  it('rejects an expiry date in the past', async () => {
    const member = await getDb()('members').where({ user_id: ids.cara }).first();
    expect((await request(app).post(`/api/admin/members/${member.id}/cash-payment`).set(auth('admin')).send({ amount: 500, expiry_date: '2020-01-01' })).status).toBe(400);
  });
  it('records the member as payer and the admin as ledger author', async () => {
    const db = getDb();
    const member = await db('members').where({ user_id: ids.cara }).first();
    const r = await request(app).post(`/api/admin/members/${member.id}/cash-payment`).set(auth('admin')).send({ amount: 500 });
    expect(r.status).toBe(201); expect(r.body.status).toBe('active');
    const payment = await db('payments').where({ id: r.body.payment_id }).first();
    expect(payment.user_id).toBe(ids.cara);
    expect((await db('ledger_entries').where({ source_type: 'payment', source_id: payment.id }).first()).entered_by).toBe(ids.admin);
  });
});

describe('member verification', () => {
  it('matches a numeric student ID before a member row id', async () => {
    const r = await request(app).get('/api/admin/members/1/verify').set(auth('admin2'));
    expect(r.body.member.student_id).toBe('1');
    expect(r.body.member.name).toBe('bob');
  });
});

describe('auth & errors', () => {
  it('malformed JSON body is a 400, not a 500', async () => {
    const r = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(r.status).toBe(400);
  });
  it('rejects a token with an unknown role or a non-numeric subject', async () => {
    const bad = jwt.sign({ sub: String(ids.alice), role: 'superuser' }, env.JWT_SECRET, { algorithm: 'HS256' });
    expect((await request(app).get('/api/me').set({ Authorization: `Bearer ${bad}` })).status).toBe(401);
    const noSub = jwt.sign({ role: 'admin' }, env.JWT_SECRET, { algorithm: 'HS256' });
    expect((await request(app).get('/api/admin/members').set({ Authorization: `Bearer ${noSub}` })).status).toBe(401);
    // A token minted before the two-role migration carries a retired role: re-login, not a crash or a silent downgrade.
    const legacy = jwt.sign({ sub: String(ids.alice), role: 'treasurer' }, env.JWT_SECRET, { algorithm: 'HS256' });
    expect((await request(app).get('/api/me').set({ Authorization: `Bearer ${legacy}` })).status).toBe(401);
  });
  it('a deactivated account gets 401 from /me instead of `user: undefined`', async () => {
    await getDb()('users').where({ id: ids.bob }).update({ is_active: false });
    expect((await request(app).get('/api/me').set(auth('bob'))).status).toBe(401);
    await getDb()('users').where({ id: ids.bob }).update({ is_active: true });
    const me = await request(app).get('/api/me').set(auth('admin'));
    expect(me.status).toBe(200); expect(me.body.active).toBe(false); expect(me.body.user.is_active).toBeUndefined();
  });
  it('maps a lost unique-key race to 409', () => {
    const res: any = { headersSent: false, status(s: number) { this.code = s; return this; }, json(b: unknown) { this.body = b; return this; } };
    errorHandler(Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }), {} as any, res, () => {});
    expect(res.code).toBe(409);
  });
});

describe('club calendar (Asia/Kolkata)', () => {
  it('uses the IST date, not the UTC one', () => {
    expect(ymdInTz(new Date('2026-06-29T20:00:00Z'))).toBe('2026-06-30'); // 01:30 IST
    expect(academicYearEnd(new Date('2026-06-28T12:00:00Z'))).toBe('2026-06-30');
    expect(academicYearEnd(new Date('2026-06-29T20:00:00Z'))).toBe('2027-06-30'); // already year-end day in IST
  });
  it('expires memberships on the IST day after expiry (job runs 00:05 IST = 18:35 UTC the previous day)', async () => {
    const db = getDb();
    const member = await db('members').where({ user_id: ids.bob }).first();
    const [id] = await db('memberships').insert({ member_id: member.id, start_date: '2025-07-01', expiry_date: '2026-07-01', status: 'active' });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-01T18:35:00Z')); // 2 July 00:05 IST; UTC date is still 1 July
    await expireMemberships();
    vi.useRealTimers();
    expect((await db('memberships').where({ id }).first()).status).toBe('expired');
  });
});

describe('email', () => {
  it('sends one message per recipient and never throws on a network error', async () => {
    const key = env.RESEND_API_KEY;
    (env as any).RESEND_API_KEY = 're_test';
    try {
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      expect(await sendMail({ to: ['a@x.test', 'b@x.test', 'a@x.test'], subject: 's', html: 'h' })).toBe(2);
      const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sent.map((m: any) => m.to)).toEqual([['a@x.test'], ['b@x.test']]); // nobody sees the other addresses
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
      expect(await sendMail({ to: 'a@x.test', subject: 's', html: 'h' })).toBe(0);
    } finally {
      (env as any).RESEND_API_KEY = key;
    }
  });
});

describe('production config', () => {
  it('refuses to boot without real secrets and never trusts a default webhook secret', async () => {
    const saved = { ...process.env };
    try {
      vi.resetModules();
      Object.assign(process.env, { NODE_ENV: 'production' });
      delete process.env.JWT_SECRET; delete process.env.QR_SECRET; delete process.env.PAYMENT_WEBHOOK_SECRET;
      await expect(import('../src/config/env')).rejects.toThrow(/JWT_SECRET, QR_SECRET/);
      vi.resetModules();
      Object.assign(process.env, { JWT_SECRET: 'a'.repeat(32), QR_SECRET: 'b'.repeat(16) });
      delete process.env.APP_URL;
      await expect(import('../src/config/env')).rejects.toThrow(/APP_URL/); // emails and the domain redirect need it
      vi.resetModules();
      process.env.APP_URL = 'https://skyline-student-association.up.railway.app/';
      await expect(import('../src/config/env')).rejects.toThrow(/slash/);
      vi.resetModules();
      process.env.APP_URL = 'https://skyline-student-association.up.railway.app';
      const prod = await import('../src/config/env');
      expect(prod.env.PAYMENT_WEBHOOK_SECRET).toBe('');
      expect(prod.appUrl('/me')).toBe('https://skyline-student-association.up.railway.app/me');
    } finally {
      process.env = saved;
      vi.resetModules();
    }
  });
});

describe('static frontend', () => {
  it('serves index.html for page routes but 404s missing files', async () => {
    const fs = await import('node:fs'); const path = await import('node:path');
    if (!fs.existsSync(path.resolve(__dirname, '../../frontend/dist/index.html'))) return; // frontend not built
    const page = await request(app).get('/events/1');
    expect(page.status).toBe(200); expect(page.headers['content-type']).toMatch(/html/);
    expect((await request(app).get('/media/merch/missing.mp4')).status).toBe(404);
    expect((await request(app).get('/health')).text).toBe('ok');
  });
});

describe('cash dues extension', () => {
  it('extends an active membership from its current expiry; an earlier expiry is refused', async () => {
    const db = getDb();
    const r = await request(app).post('/api/auth/register').send({ name: 'ext', email: 'ext@p.test', password: 'Gala#Night7River', student_id: 'SKY-EXT' });
    const member = await db('members').where({ user_id: r.body.user.id }).first();
    const first = await request(app).post(`/api/admin/members/${member.id}/cash-payment`).set(auth('admin')).send({ amount: 500, expiry_date: '2099-06-30' });
    expect(first.status).toBe(201); expect(first.body.extended).toBe(false);
    expect((await request(app).post(`/api/admin/members/${member.id}/cash-payment`).set(auth('admin')).send({ amount: 500, expiry_date: '2099-01-01' })).status).toBe(400);
    const ext = await request(app).post(`/api/admin/members/${member.id}/cash-payment`).set(auth('admin')).send({ amount: 500 });
    expect(ext.status).toBe(201); expect(ext.body.extended).toBe(true);
    expect(ext.body.start_date).toBe('2099-07-01'); expect(ext.body.expiry_date).toBe('2100-06-30');
    expect((await request(app).get('/api/me').set({ Authorization: `Bearer ${r.body.token}` })).body.membership_expires).toBe('2100-06-30');
    expect(await db('ledger_entries').where({ category: 'dues' }).whereIn('source_id', await db('payments').where({ user_id: r.body.user.id }).pluck('id'))).toHaveLength(2);
  });
});

describe('GET /api/stats (landing page)', () => {
  it('counts hosted and upcoming events, active members, students and tickets from the database', async () => {
    const db = getDb();
    const before = (await request(app).get('/api/stats')).body;
    expect(before).toEqual(expect.objectContaining({ events_hosted: expect.any(Number), upcoming_events: expect.any(Number), members: expect.any(Number), students: expect.any(Number), tickets_issued: expect.any(Number) }));
    await db('events').insert([
      { title: 'past-stat', starts_at: new Date(Date.now() - 864e5), capacity: 5, status: 'closed' },
      { title: 'draft-stat', starts_at: new Date(Date.now() - 864e5), capacity: 5, status: 'draft' },
      { title: 'next-stat', starts_at: new Date(Date.now() + 864e5), capacity: 5, status: 'published' },
    ]);
    const after = (await request(app).get('/api/stats')).body;
    expect(after.events_hosted).toBe(before.events_hosted + 1);
    expect(after.upcoming_events).toBe(before.upcoming_events + 1);
    expect(Object.keys(after)).not.toContain('balance');
  });
});
