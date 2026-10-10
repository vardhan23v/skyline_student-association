import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { freshDb, getDb } from './setup';
import { createApp } from '../src/app';
import { hmacSha256 } from '../src/lib/hash';
import { env } from '../src/config/env';
import { evaluateFlags } from '../src/modules/finance/anomaly';

let app: ReturnType<typeof createApp>;
const tokens: Record<string, string> = {};

const webhook = (order_id: string, payment_id: string, amount: number, event = 'payment.captured') => {
  const body = JSON.stringify({ event, payload: { payment: { entity: { id: payment_id, order_id, amount: Math.round(amount * 100) } } } });
  return request(app).post('/api/webhooks/payment').set('Content-Type', 'application/json').set('X-Razorpay-Signature', hmacSha256(env.PAYMENT_WEBHOOK_SECRET, body)).send(body);
};

beforeAll(async () => {
  await freshDb();
  app = createApp();
  const db = getDb();
  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.hash('password123', 4);
  for (const [name, role] of [['admin', 'admin'], ['admin2', 'admin']]) {
    await db('users').insert({ name, email: `${name}@t.test`, password_hash: hash, role });
    tokens[name] = (await request(app).post('/api/auth/login').send({ email: `${name}@t.test`, password: 'password123' })).body.token;
  }
  const r = await request(app).post('/api/auth/register').send({ name: 'Mia Member', email: 'mia@t.test', password: 'password123', student_id: 'SKY1' });
  tokens.member = r.body.token;
});

const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

describe('auth & roles', () => {
  it('registers as `user`; the ledger is admin-only', async () => {
    expect((await request(app).get('/api/me').set(auth('member'))).body.user.role).toBe('user');
    expect((await request(app).get('/api/admin/finance/ledger').set(auth('member'))).status).toBe(403);
    expect((await request(app).get('/api/admin/finance/ledger').set(auth('admin'))).status).toBe(200);
  });
  it('finance summary is admin-only', async () => {
    expect((await request(app).get('/api/finance/summary')).status).toBe(401);
    expect((await request(app).get('/api/finance/summary').set(auth('member'))).status).toBe(403);
    const r = await request(app).get('/api/finance/summary').set(auth('admin'));
    expect(r.status).toBe(200); expect(r.body.balance).toBe(0);
  });
});

describe('membership', () => {
  it('cash dues activates membership and writes one ledger row', async () => {
    const members = await getDb()('members');
    const r = await request(app).post(`/api/admin/members/${members[0].id}/cash-payment`).set(auth('admin')).send({ amount: 500 });
    expect(r.status).toBe(201); expect(r.body.status).toBe('active');
    const me = await request(app).get('/api/me').set(auth('member'));
    expect(me.body.active).toBe(true); expect(me.body.qr_token).toBeTruthy();
    const v = await request(app).get(`/api/admin/members/x/verify?qr_token=${me.body.qr_token}`).set(auth('admin'));
    expect(v.body.valid).toBe(true);
    expect((await getDb()('ledger_entries').where({ category: 'dues' })).length).toBe(1);
  });
});

describe('tickets', () => {
  let eventId: number; let qr: string; let orderId: string;
  it('admin creates and publishes an event', async () => {
    const r = await request(app).post('/api/admin/events').set(auth('admin')).send({ title: 'Gala', starts_at: new Date(Date.now() + 864e5).toISOString(), capacity: 2, member_price: 300, status: 'published' });
    expect(r.status).toBe(201); eventId = r.body.id;
  });
  it('member registers at the member price; webhook confirms; duplicate webhook is idempotent', async () => {
    const r = await request(app).post(`/api/events/${eventId}/register`).set(auth('member'));
    expect(r.status).toBe(201); expect(Number(r.body.ticket.price)).toBe(300); expect(r.body.ticket.status).toBe('pending');
    orderId = r.body.checkout.order_id;
    expect((await webhook(orderId, 'pay_1', 300)).body.result).toBe('confirmed');
    expect((await webhook(orderId, 'pay_1', 300)).body.result).toBe('already_paid');
    const t = await request(app).get(`/api/tickets/${r.body.ticket.id}`).set(auth('member'));
    expect(t.body.status).toBe('confirmed'); qr = t.body.qr_token;
    expect((await getDb()('ledger_entries').where({ category: 'ticket' })).length).toBe(1);
  });
  it('rejects a bad webhook signature', async () => {
    const r = await request(app).post('/api/webhooks/payment').set('Content-Type', 'application/json').set('X-Razorpay-Signature', 'nope').send('{}');
    expect(r.status).toBe(400);
  });
  it('enforces capacity', async () => {
    const db = getDb();
    const join = async (name: string) => {
      const r = await request(app).post('/api/auth/register').send({ name, email: `${name}@t.test`, password: 'password123', student_id: `SKY-${name}` });
      const m = await db('members').where({ user_id: r.body.user.id }).first();
      await request(app).post(`/api/admin/members/${m.id}/cash-payment`).set(auth('admin')).send({ amount: 500 });
      return { Authorization: `Bearer ${r.body.token}` };
    };
    expect((await request(app).post(`/api/events/${eventId}/register`).set(await join('guest'))).status).toBe(201);
    expect((await request(app).post(`/api/events/${eventId}/register`).set(await join('guest2'))).body.code).toBe('SOLD_OUT');
  });
  it('check-in succeeds once, then rejects', async () => {
    const a = await request(app).post('/api/admin/checkin').set(auth('admin2')).send({ qr_token: qr, event_id: eventId });
    expect(a.status).toBe(200); expect(a.body.ok).toBe(true); expect(a.body.membership_active).toBe(true);
    const b = await request(app).post('/api/admin/checkin').set(auth('admin2')).send({ qr_token: qr });
    expect(b.status).toBe(409); expect(b.body.reason).toMatch(/Already used/);
    expect((await request(app).post('/api/admin/checkin').set(auth('admin2')).send({ qr_token: 'garbage-token' })).body.reason).toMatch(/Invalid/);
  });
  it('event report counts sold / checked-in / revenue', async () => {
    const r = await request(app).get(`/api/admin/events/${eventId}/report`).set(auth('admin'));
    expect(r.body.sold).toBe(1); expect(r.body.checked_in).toBe(1); expect(r.body.pending).toBe(1); expect(r.body.revenue).toBe(300);
  });
});

describe('finance', () => {
  let expenseId: number;
  it('an admin submits an expense; another admin approves and pays → ledger out', async () => {
    const r = await request(app).post('/api/admin/expenses').set(auth('admin2')).send({ amount: 450, category: 'supplies', description: 'Tape', receipt_base64: Buffer.from('receipt').toString('base64'), receipt_mime: 'image/png' });
    expect(r.status).toBe(201); expenseId = r.body.id; expect(r.body.flags).toEqual([]);
    expect((await request(app).patch(`/api/admin/expenses/${expenseId}/pay`).set(auth('admin'))).status).toBe(400);
    expect((await request(app).patch(`/api/admin/expenses/${expenseId}/review`).set(auth('admin2')).send({ decision: 'approved' })).status).toBe(403); // own expense
    expect((await request(app).patch(`/api/admin/expenses/${expenseId}/review`).set(auth('admin')).send({ decision: 'approved' })).body.status).toBe('approved');
    expect((await request(app).patch(`/api/admin/expenses/${expenseId}/pay`).set(auth('admin'))).body.status).toBe('paid');
    const s = await request(app).get('/api/finance/summary').set(auth('admin'));
    // dues 500 + guest dues 2×500 + gala ticket 300
    expect(s.body.total_in).toBe(1800); expect(s.body.total_out).toBe(450); expect(s.body.balance).toBe(1350);
  });
  it('flags duplicate receipt and missing receipt', async () => {
    const dup = await request(app).post('/api/admin/expenses').set(auth('admin2')).send({ amount: 999, category: 'supplies', receipt_base64: Buffer.from('receipt').toString('base64'), receipt_mime: 'image/png' });
    expect(dup.body.flags.map((f: any) => f.code)).toContain('DUPLICATE_RECEIPT');
    const flags = await evaluateFlags(getDb(), { id: null, submitted_by: 1, amount: 300, category: 'misc', receipt_hash: null });
    expect(flags.map((f) => f.code)).toEqual(['NO_RECEIPT']);
  });
  it('ledger CSV export and reversal', async () => {
    const csv = await request(app).get('/api/admin/finance/ledger?format=csv').set(auth('admin'));
    expect(csv.headers['content-type']).toMatch(/csv/); expect(csv.text.split('\n').length).toBeGreaterThan(2);
    const [entry] = await getDb()('ledger_entries').where({ direction: 'out' });
    expect((await request(app).post(`/api/admin/finance/ledger/${entry.id}/reverse`).set(auth('admin')).send({ memo: 'entered twice' })).status).toBe(201);
    expect((await request(app).get('/api/finance/summary').set(auth('admin'))).body.balance).toBe(1800);
  });
});

describe('merch, fundraisers, announcements, AI', () => {
  it('stock reservation + webhook + fulfil', async () => {
    const p = await request(app).post('/api/admin/products').set(auth('admin')).send({ name: 'Hoodie', variants: [{ size: 'M', price: 1000, member_price: 800, stock: 1 }] });
    const products = await request(app).get('/api/products').set(auth('member'));
    const v = products.body[0].variants[0]; expect(v.price_for_you).toBe(800);
    const o = await request(app).post('/api/orders').set(auth('member')).send({ items: [{ variant_id: v.id, qty: 1 }] });
    expect(o.status).toBe(201);
    expect((await request(app).post('/api/orders').set(auth('member')).send({ items: [{ variant_id: v.id, qty: 1 }] })).status).toBe(409);
    expect((await webhook(o.body.checkout.order_id, 'pay_m1', 800)).body.result).toBe('confirmed');
    expect((await request(app).patch(`/api/admin/orders/${o.body.order.id}`).set(auth('admin')).send({ status: 'fulfilled' })).body.status).toBe('fulfilled');
    expect((await getDb()('product_variants').where({ id: v.id }).first()).stock).toBe(0);
    expect(p.status).toBe(201);
  });
  it('fundraiser progress derives from ledger', async () => {
    const f = await request(app).post('/api/admin/fundraisers').set(auth('admin')).send({ name: 'Bake', target_amount: 1000, status: 'active' });
    await request(app).post(`/api/admin/fundraisers/${f.body.id}/cash-income`).set(auth('admin')).send({ amount: 250 });
    const t = await request(app).post(`/api/admin/fundraisers/${f.body.id}/tasks`).set(auth('admin')).send({ title: 'Posters', due_on: '2020-01-01' });
    expect((await request(app).patch(`/api/admin/tasks/${t.body.id}`).set(auth('member')).send({ status: 'done' })).status).toBe(403);
    const g = await request(app).get(`/api/fundraisers/${f.body.id}`).set(auth('member'));
    expect(g.body.raised).toBe(250); expect(g.body.progress).toBe(0.25); expect(g.body.tasks_overdue).toBe(1);
  });
  it('announcement audience filtering', async () => {
    await request(app).post('/api/admin/announcements').set(auth('admin')).send({ title: 'Secret', body: 'members only', audience: 'members' });
    expect((await request(app).get('/api/announcements')).body.length).toBe(0);
    expect((await request(app).get('/api/announcements').set(auth('member'))).body.length).toBe(1);
  });
  it('AI secretary answers from tools and gates proposals by role', async () => {
    const r = await request(app).post('/api/ai/ask').set(auth('admin')).send({ prompt: 'what is our balance?' });
    expect(r.body.answer).toMatch(/balance is ₹2850/); expect(r.body.numbers_verified).toBe(true);
    // Finance is admin-only, so a member gets no figures from the secretary either.
    const m = await request(app).post('/api/ai/ask').set(auth('member')).send({ prompt: 'what is our balance?' });
    expect(m.body.answer).toMatch(/only available to admins/); expect(m.body.answer).not.toMatch(/₹/);
    const d = await request(app).post('/api/ai/ask').set(auth('admin')).send({ prompt: 'draft an announcement about the gala' });
    expect(d.body.proposal).toBeTruthy();
    expect((await request(app).post(`/api/ai/confirm/${d.body.proposal.id}`).set(auth('member'))).status).toBe(403);
    expect((await request(app).post(`/api/ai/confirm/${d.body.proposal.id}`).set(auth('admin'))).body.ok).toBe(true);
    expect((await request(app).post(`/api/ai/confirm/${d.body.proposal.id}`).set(auth('admin'))).status).toBe(400);
  });
});
