import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { freshDb, getDb } from './setup';
import { createApp } from '../src/app';
import { logger } from '../src/lib/logger';
import { createPasswordToken, SETUP_TTL_MINUTES } from '../src/modules/auth/service';

let app: ReturnType<typeof createApp>;
let uid: number;
const EMAIL = 'reset@pw.test';

/** The reset link the service logs while Resend is off (as in tests). */
const linkSpy = () => vi.spyOn(logger, 'info');
const tokenFrom = (spy: ReturnType<typeof linkSpy>) => {
  const call = spy.mock.calls.find((c) => c[1] === 'password reset link (email not configured)');
  return call ? new URL((call[0] as any).url).searchParams.get('token') : null;
};
const login = (password: string) => request(app).post('/api/auth/login').send({ email: EMAIL, password });
const forgot = (email: string) => request(app).post('/api/auth/forgot-password').send({ email });
const reset = (token: string | null, password: string) => request(app).post('/api/auth/reset-password').send({ token, password });

beforeAll(async () => {
  await freshDb();
  app = createApp();
  [uid] = await getDb()('users').insert({ name: 'Reset Me', email: EMAIL, password_hash: await bcrypt.hash('Oldpass123', 4), role: 'user' });
});
afterEach(() => vi.restoreAllMocks());

describe('forgot password', () => {
  it('answers the same for an unknown email and sends nothing', async () => {
    const spy = linkSpy();
    const unknown = await forgot('nobody@pw.test');
    const known = await forgot(EMAIL);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(spy.mock.calls.filter((c) => c[1] === 'password reset link (email not configured)')).toHaveLength(1);
    expect(spy.mock.calls.some((c) => JSON.stringify(c[0]).includes('nobody@pw.test'))).toBe(false);
    expect(await getDb()('password_tokens').where({ user_id: uid }).count({ n: '*' })).toEqual([{ n: 1 }]);
  });

  it('stores only a hash of the token, and nothing for an inactive account', async () => {
    const spy = linkSpy();
    await forgot(EMAIL);
    const token = tokenFrom(spy)!;
    const rows = await getDb()('password_tokens').where({ user_id: uid }).pluck('token_hash');
    expect(rows).not.toContain(token);
    expect(rows.every((h: string) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
    await getDb()('users').insert({ name: 'Off', email: 'off@pw.test', password_hash: 'x', role: 'user', is_active: false });
    await forgot('off@pw.test');
    expect(await getDb()('password_tokens').join('users', 'users.id', 'password_tokens.user_id').where('users.email', 'off@pw.test').count({ n: '*' })).toEqual([{ n: 0 }]);
  });

  it('validates the email', async () => {
    expect((await forgot('not-an-email')).status).toBe(400);
  });
});

describe('reset password', () => {
  it('a link works once; afterwards the old password fails and the new one works', async () => {
    const spy = linkSpy();
    await forgot(EMAIL);
    const token = tokenFrom(spy);
    expect(token).toBeTruthy();
    const ok = await reset(token, 'Newpass456');
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ ok: true, purpose: 'reset' });
    expect((await login('Oldpass123')).status).toBe(401);
    expect((await login('Newpass456')).status).toBe(200);
    const again = await reset(token, 'Another789');
    expect([again.status, again.body.code]).toEqual([400, 'INVALID_TOKEN']);
    expect(await getDb()('audit_logs').where({ action: 'password_reset', user_id: String(uid) }).count({ n: '*' })).toEqual([{ n: 1 }]);
  });

  it('using one link invalidates the user\'s other open links', async () => {
    const a = await createPasswordToken(uid, 'reset', 60);
    const b = await createPasswordToken(uid, 'reset', 60);
    expect((await reset(a, 'Fresh1234')).status).toBe(200);
    expect((await reset(b, 'Fresh5678')).body.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired link and an unknown one', async () => {
    const token = await createPasswordToken(uid, 'reset', 60);
    await getDb()('password_tokens').where({ user_id: uid }).whereNull('used_at').update({ expires_at: new Date(Date.now() - 1000) });
    expect((await reset(token, 'Late12345')).body.code).toBe('INVALID_TOKEN');
    expect((await reset('x'.repeat(43), 'Late12345')).status).toBe(400);
  });

  it('needs at least 8 characters with a letter and a number', async () => {
    const token = await createPasswordToken(uid, 'reset', 60);
    for (const pw of ['short1', 'lettersonly', '12345678']) expect((await reset(token, pw)).status).toBe(400);
    expect((await reset(token, 'Good1234')).status).toBe(200);
  });

  it('setup links (for Section B) last 72 hours and report their purpose', async () => {
    const token = await createPasswordToken(uid, 'setup', SETUP_TTL_MINUTES);
    const row = await getDb()('password_tokens').where({ user_id: uid, purpose: 'setup' }).whereNull('used_at').first();
    expect(row).toBeTruthy();
    expect((await getDb()('password_tokens').where({ id: row.id }).where('expires_at', '>', new Date(Date.now() + 71 * 3600_000)).count({ n: '*' }))[0].n).toBe(1);
    expect((await reset(token, 'Setup1234')).body).toMatchObject({ ok: true, purpose: 'setup' });
  });
});
