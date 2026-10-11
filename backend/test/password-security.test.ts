import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { freshDb, getDb } from './setup';
import { createApp } from '../src/app';
import { validatePassword } from '../src/lib/password';
import { createPasswordToken } from '../src/modules/auth/service';
import { DEMO_LOGINS, seed } from '../../database/seeds/001_demo';

let app: ReturnType<typeof createApp>;
const login = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password });
const addUser = async (email: string, password: string, rounds = 4) => {
  const [id] = await getDb()('users').insert({ name: 'Old Timer', email, password_hash: await bcrypt.hash(password, rounds), role: 'user' });
  return id as number;
};

beforeAll(async () => { await freshDb(); app = createApp(); });
afterEach(() => { vi.useRealTimers(); delete process.env.BCRYPT_ROUNDS; });

describe('validatePassword', () => {
  it.each(['12345678901', 'password123!', 'Skyline@2026', 'aaaaaaaaaa1!', 'Abcd1234!xyz', ' Gala#Night7River', 'Gala#Night7River ', 'AAAAAAAAAAAA', 'Qwer#Tyui2026x'])('rejects %s', (pw) => {
    expect(validatePassword(pw).ok).toBe(false);
  });

  it('accepts a strong password', () => {
    expect(validatePassword('Gala#Night7River')).toEqual({ ok: true, errors: [] });
  });

  it('explains what is missing in plain words', () => {
    expect(validatePassword('12345678901').errors).toEqual(expect.arrayContaining(['Add an uppercase letter', 'Add a special character', "Don't use only numbers", 'Avoid sequences like 1234, abcd or qwer']));
    expect(validatePassword('password123!').errors).toContain('Too common, choose something less predictable');
    expect(validatePassword('Abcd1234!xyz').errors).toEqual(['Avoid sequences like 1234, abcd or qwer']);
  });

  it("refuses the person's own email name, first name and student ID, case-insensitively", () => {
    expect(validatePassword('Meera.Iyer#2026x', { email: 'meera.iyer@skyline.edu' }).errors).toEqual(["Don't use your email name"]);
    expect(validatePassword('Rohan#Gala7River', { name: 'Rohan Das' }).errors).toEqual(["Don't use your name"]);
    expect(validatePassword('Gala#sky2026001x', { studentId: 'SKY2026001' }).errors).toEqual(["Don't use your student ID"]);
  });

  it('every documented demo password meets the rules for its own account', () => {
    for (const d of DEMO_LOGINS) expect(validatePassword(d.password, { email: d.email }).ok).toBe(true);
  });
});

describe('setting a password', () => {
  it('register with a weak password → 400 WEAK_PASSWORD listing the problems', async () => {
    const r = await request(app).post('/api/auth/register').send({ name: 'Weak Will', email: 'weak@ps.test', password: '12345678' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('WEAK_PASSWORD');
    expect(r.body.errors).toEqual(expect.arrayContaining(['Use at least 10 characters', 'Add an uppercase letter', 'Too common, choose something less predictable']));
    const own = await request(app).post('/api/auth/register').send({ name: 'Priya Nair', email: 'priya.nair@ps.test', password: 'Priya#Gala2026x' });
    expect(own.body).toMatchObject({ code: 'WEAK_PASSWORD', errors: ["Don't use your email name"] });
    const ok = await request(app).post('/api/auth/register').send({ name: 'Priya Nair', email: 'priya.nair@ps.test', password: 'Gala#Night7River' });
    expect(ok.status).toBe(201);
  });

  it("a reset link refuses the account's own details and isn't used up by the refusal", async () => {
    const id = await addUser('kabir.sen@ps.test', 'Oldpass123');
    const token = await createPasswordToken(id, 'reset', 60);
    const bad = await request(app).post('/api/auth/reset-password').send({ token, password: 'Kabir.Sen#2026x' });
    expect(bad.body).toMatchObject({ code: 'WEAK_PASSWORD', errors: ["Don't use your email name"] });
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'Harbor#Lights26' })).status).toBe(200);
  });

  it('change password: needs the current one, follows the rules, clears the update flag', async () => {
    await addUser('change@ps.test', 'Oldpass123');
    const token = (await login('change@ps.test', 'Oldpass123')).body.token;
    const auth = { Authorization: `Bearer ${token}` };
    expect((await request(app).get('/api/me').set(auth)).body.user.password_weak).toBe(true);
    expect((await request(app).post('/api/auth/change-password').set(auth).send({ current_password: 'nope', password: 'Harbor#Lights26' })).body.code).toBe('WRONG_PASSWORD');
    expect((await request(app).post('/api/auth/change-password').set(auth).send({ current_password: 'Oldpass123', password: 'weakweak' })).body.code).toBe('WEAK_PASSWORD');
    expect((await request(app).post('/api/auth/change-password').set(auth).send({ current_password: 'Oldpass123', password: 'Harbor#Lights26' })).status).toBe(200);
    expect((await request(app).get('/api/me').set(auth)).body.user.password_weak).toBe(false);
    expect((await login('change@ps.test', 'Harbor#Lights26')).status).toBe(200);
    expect((await request(app).post('/api/auth/change-password').send({ current_password: 'x', password: 'Harbor#Lights26' })).status).toBe(401);
  });
});

describe('logging in', () => {
  it('an existing user with an old password still logs in, is flagged, and the hash is upgraded to the current cost', async () => {
    const id = await addUser('old@ps.test', 'Oldpass123', 4);
    process.env.BCRYPT_ROUNDS = '6';
    const r = await login('old@ps.test', 'Oldpass123');
    expect(r.status).toBe(200);
    expect(r.body.user.password_weak).toBe(true);
    const row = await getDb()('users').where({ id }).first();
    expect(bcrypt.getRounds(row.password_hash)).toBe(6);
    expect(await bcrypt.compare('Oldpass123', row.password_hash)).toBe(true);
  });

  it('5 wrong passwords lock the account for 15 minutes, even for the right password; it unlocks afterwards', async () => {
    await addUser('lock@ps.test', 'Gala#Night7River');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-11T10:00:00Z'));
    for (let i = 0; i < 5; i++) {
      const r = await login('lock@ps.test', 'wrong-password');
      expect(r.status).toBe(401);
      expect(r.body.message).toBe('Invalid email or password');
    }
    const locked = await login('lock@ps.test', 'Gala#Night7River');
    expect(locked.status).toBe(401);
    expect(locked.body.message).toBe('Invalid email or password');
    vi.setSystemTime(new Date('2026-10-11T10:14:00Z'));
    expect((await login('lock@ps.test', 'Gala#Night7River')).status).toBe(401);
    vi.setSystemTime(new Date('2026-10-11T10:15:30Z'));
    expect((await login('lock@ps.test', 'Gala#Night7River')).status).toBe(200);
    expect((await getDb()('audit_logs').where({ action: 'login_locked' })).length).toBe(1);
  });

  it('failures spread over more than 15 minutes do not add up to a lock', async () => {
    await addUser('slow@ps.test', 'Gala#Night7River');
    vi.useFakeTimers({ toFake: ['Date'] });
    for (let i = 0; i < 6; i++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 9, 11, 12, i * 16)));
      await login('slow@ps.test', 'wrong-password');
    }
    expect((await login('slow@ps.test', 'Gala#Night7River')).status).toBe(200);
  });

  it('a successful login resets the counter', async () => {
    await addUser('reset@ps.test', 'Gala#Night7River');
    for (let i = 0; i < 4; i++) await login('reset@ps.test', 'wrong-password');
    expect((await login('reset@ps.test', 'Gala#Night7River')).status).toBe(200);
    for (let i = 0; i < 4; i++) await login('reset@ps.test', 'wrong-password');
    expect((await login('reset@ps.test', 'Gala#Night7River')).status).toBe(200);
  });
});

describe('demo accounts on a database seeded before the rules', () => {
  it('moves a demo account still on its old password to the new one, and leaves a changed one alone', async () => {
    await getDb()('users').del().whereIn('email', DEMO_LOGINS.map((d) => d.email));
    await addUser('admin@skyline.edu', 'Admin@123');
    await addUser('member@skyline.edu', 'Somebody#Changed26');
    const saved = { NODE_ENV: process.env.NODE_ENV, ALLOW_DEMO_SEED: process.env.ALLOW_DEMO_SEED };
    try {
      process.env.NODE_ENV = 'production'; process.env.ALLOW_DEMO_SEED = 'true'; process.env.BCRYPT_ROUNDS = '4';
      await seed(getDb());
    } finally {
      process.env.NODE_ENV = saved.NODE_ENV;
      if (saved.ALLOW_DEMO_SEED === undefined) delete process.env.ALLOW_DEMO_SEED; else process.env.ALLOW_DEMO_SEED = saved.ALLOW_DEMO_SEED;
    }
    expect((await login('admin@skyline.edu', 'Control#Room26')).status).toBe(200);
    expect((await login('admin@skyline.edu', 'Admin@123')).status).toBe(401);
    expect((await login('member@skyline.edu', 'Somebody#Changed26')).status).toBe(200);
  });
});
