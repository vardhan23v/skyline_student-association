import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { freshDb, getDb } from './setup';
import { createApp } from '../src/app';
import { bcryptRounds } from '../src/lib/password';
// Imported directly: knex's own seed loader uses native import(), which can't load TypeScript under vitest.
import { seed } from '../../database/seeds/001_demo';

let app: ReturnType<typeof createApp>;
const login = async (email: string, password: string) => {
  const r = await request(app).post('/api/auth/login').send({ email, password });
  expect(r.status).toBe(200);
  return { Authorization: `Bearer ${r.body.token}` };
};

describe('demo seed', () => {
  beforeAll(async () => { await freshDb(); app = createApp(); });

  it('refuses to run in production unless ALLOW_DEMO_SEED=true', async () => {
    const saved = { NODE_ENV: process.env.NODE_ENV, ALLOW_DEMO_SEED: process.env.ALLOW_DEMO_SEED };
    try {
      process.env.NODE_ENV = 'production'; delete process.env.ALLOW_DEMO_SEED;
      await expect(seed(getDb())).rejects.toThrow(/ALLOW_DEMO_SEED/);
      expect(await getDb()('users').count({ n: '*' })).toEqual([{ n: 0 }]);
    } finally {
      process.env.NODE_ENV = saved.NODE_ENV;
      if (saved.ALLOW_DEMO_SEED === undefined) delete process.env.ALLOW_DEMO_SEED; else process.env.ALLOW_DEMO_SEED = saved.ALLOW_DEMO_SEED;
    }
  });

  it('creates the three demo logins with the documented states', async () => {
    await seed(getDb());
    const admin = await login('admin@skyline.edu', 'Control#Room26');
    const member = await login('member@skyline.edu', 'Gala#Night26');
    const student = await login('student@skyline.edu', 'Campus#Walk26');
    expect((await request(app).get('/api/me').set(admin)).body.user.role).toBe('admin');
    const m = (await request(app).get('/api/me').set(member)).body;
    expect(m.user.role).toBe('user'); expect(m.is_member).toBe(true); expect(m.membership_expires).toMatch(/-06-30$/);
    const s = (await request(app).get('/api/me').set(student)).body;
    expect(s.user.role).toBe('user'); expect(s.is_member).toBe(false);
    const hash = (await getDb()('users').where({ email: 'admin@skyline.edu' }).first()).password_hash;
    // bcrypt at the configured cost (12 in production, 4 under test so the suite stays fast).
    expect(hash).toMatch(new RegExp(`^\\$2[aby]\\$${String(bcryptRounds()).padStart(2, '0')}\\$`));
  });

  it('seeds four upcoming events (Spring Gala nearly full), one past event, four products and three orders', async () => {
    const events = (await request(app).get('/api/events')).body;
    const upcoming = events.filter((e: any) => e.status === 'published' && new Date(e.starts_at) > new Date());
    expect(upcoming).toHaveLength(4);
    expect(events.filter((e: any) => new Date(e.starts_at) < new Date())).toHaveLength(1);
    expect(upcoming.find((e: any) => e.title === 'Spring Gala')).toMatchObject({ capacity: 2, seats_left: 1, member_price: 299, non_member_price: 499, members_only: false });
    expect(upcoming.find((e: any) => e.title === 'CodeStorm 2026')).toMatchObject({ members_only: true, price_for_you: null });
    const products = (await request(app).get('/api/products')).body;
    expect(products.map((p: any) => p.name).sort()).toEqual(['Bag', 'Stickers', 'T-shirt', 'Water bottle']);
    expect(products.find((p: any) => p.name === 'T-shirt').variants.map((v: any) => v.size)).toEqual(['S', 'M', 'L', 'XL']);
    const orders = (await request(app).get('/api/orders/mine').set(await login('member@skyline.edu', 'Gala#Night26'))).body;
    expect(orders.map((o: any) => o.status).sort()).toEqual(['fulfilled', 'paid', 'pending']);
    // The ledger agrees with the paid things: dues 500 (+500 Kiran's lapsed year) + gala 299 + orders (449 + 2×79) + 359, plus fundraiser cash 3,500 + 5,200.
    expect((await request(app).get('/api/admin/overview').set(await login('admin@skyline.edu', 'Control#Room26'))).body.balance).toBe(500 + 500 + 299 + 607 + 359 + 3500 + 5200);
  });

  it('seeds a second admin and the Bake Sale: ₹3,500 of ₹10,000, 1 of 4 tasks done, 1 overdue, behind', async () => {
    const core = await login('core@skyline.edu', 'Second#Desk26');
    expect((await request(app).get('/api/me').set(core)).body.user.role).toBe('admin');
    const list = (await request(app).get('/api/admin/fundraisers').set(core)).body;
    expect(list.find((f: any) => f.name === 'Bake Sale')).toMatchObject({ status: 'active', raised: 3500, target_amount: 10000, progress_pct: 35, tasks_total: 4, tasks_done: 1, tasks_overdue: 1, days_left: 10, health: 'behind', assignees: ['Asha Rao', 'Core Admin'] });
    expect(list.find((f: any) => f.status === 'completed')).toMatchObject({ health: 'completed' });
  });
});
