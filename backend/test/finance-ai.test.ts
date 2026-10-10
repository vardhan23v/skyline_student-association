import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { freshDb, getDb } from './setup';
import { createApp } from '../src/app';
import { signToken, type Role } from '../src/middleware/auth';
import { evaluateFlags } from '../src/modules/finance/anomaly';
import { reviewExpense } from '../src/modules/finance/service';

let app: ReturnType<typeof createApp>;
const users: Record<string, { id: number; token: string }> = {};
const auth = (who: string) => ({ Authorization: `Bearer ${users[who].token}` });
const sqlTs = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19); // SQLite CURRENT_TIMESTAMP format
const png = Buffer.from('fake-png-bytes');

beforeAll(async () => {
  await freshDb();
  app = createApp();
  // `admin` reviews; `admin2` and `admin3` submit (nobody reviews their own expense).
  const people: [string, Role][] = [['admin', 'admin'], ['admin2', 'admin'], ['admin3', 'admin'], ['member', 'user'], ['member2', 'user']];
  for (const [name, role] of people) {
    const [id] = await getDb()('users').insert({ name, email: `${name}@fa.test`, password_hash: 'x', role });
    users[name] = { id: id as number, token: signToken({ id: id as number, role, email: `${name}@fa.test` }) };
  }
});

describe('expenses', () => {
  let mineId: number;
  beforeAll(async () => {
    const a = await request(app).post('/api/admin/expenses').set(auth('admin2')).send({ amount: 120, category: 'food', receipt_base64: png.toString('base64'), receipt_mime: 'image/png' });
    expect(a.status).toBe(201); mineId = a.body.id;
    await request(app).post('/api/admin/expenses').set(auth('admin3')).send({ amount: 999, category: 'misc' }); // flagged NO_RECEIPT
  });

  it('`?mine=false` / `?flagged=false` are not treated as true', async () => {
    const all = (await request(app).get('/api/admin/expenses?mine=false').set(auth('admin'))).body;
    expect(all.length).toBe(2);
    expect((await request(app).get('/api/admin/expenses?flagged=false').set(auth('admin'))).body.length).toBe(2);
    expect((await request(app).get('/api/admin/expenses?flagged=true').set(auth('admin'))).body.length).toBe(1);
    expect((await request(app).get('/api/admin/expenses?mine=true').set(auth('admin'))).body.length).toBe(0);
  });

  it('list rows carry a short signed receipt link instead of the inline data: URL, and the link serves the file', async () => {
    const row = (await request(app).get('/api/admin/expenses').set(auth('admin'))).body.find((x: any) => x.id === mineId);
    expect(row.receipt_url).toMatch(/^\/api\/expenses\/\d+\/receipt\?exp=\d+&sig=[0-9a-f]{64}$/);
    const file = await request(app).get(row.receipt_url); // plain link: no Authorization header
    expect(file.status).toBe(200); expect(file.headers['content-type']).toMatch(/image\/png/); expect(Buffer.from(file.body).equals(png)).toBe(true);
    expect((await request(app).get(row.receipt_url.replace(/sig=[0-9a-f]+/, `sig=${'0'.repeat(64)}`))).status).toBe(403);
    expect((await request(app).get(row.receipt_url.replace(`/${mineId}/`, `/${mineId + 1}/`))).status).toBe(403);
  });

  it('unknown event/fundraiser on submit is a 400, not a foreign-key 500', async () => {
    expect((await request(app).post('/api/admin/expenses').set(auth('admin2')).send({ amount: 10, category: 'x', event_id: 424242 })).status).toBe(400);
    expect((await request(app).post('/api/admin/expenses').set(auth('admin2')).send({ amount: 10, category: 'x', fundraiser_id: 424242 })).status).toBe(400);
    expect((await request(app).post('/api/admin/expenses').set(auth('member')).send({ amount: 10, category: 'x' })).status).toBe(403);
  });

  it('review only accepts approved/rejected (AI path cannot mark an expense paid without a ledger row)', async () => {
    await expect(reviewExpense(users.admin.id, mineId, 'paid' as any)).rejects.toMatchObject({ status: 400 });
    expect((await getDb()('expenses').where({ id: mineId }).first()).status).toBe('submitted');
  });

  it('POSSIBLE_RESUBMIT is anchored on the expense date (not "last 7 days from now") and works on SQLite', async () => {
    const db = getDb();
    const day = 864e5, now = Date.now();
    await db('expenses').insert({ submitted_by: users.member2.id, amount: 777, category: 'travel', status: 'submitted', flags: '[]', created_at: sqlTs(new Date(now - 40 * day)) });
    expect((await evaluateFlags(db, { id: null, submitted_by: users.member2.id, amount: 777, category: 'travel', receipt_hash: 'h1' })).map((f) => f.code)).not.toContain('POSSIBLE_RESUBMIT');
    const [b] = await db('expenses').insert({ submitted_by: users.member2.id, amount: 777, category: 'travel', status: 'submitted', flags: '[]', created_at: sqlTs(new Date(now - 38 * day)) });
    const rescanned = await evaluateFlags(db, { ...(await db('expenses').where({ id: b }).first()), amount: 777, receipt_hash: 'h2' });
    expect(rescanned.map((f) => f.code)).toContain('POSSIBLE_RESUBMIT');
  });
});

describe('ledger & summary', () => {
  let fid: number;
  beforeAll(async () => {
    const db = getDb();
    fid = (await request(app).post('/api/admin/fundraisers').set(auth('admin')).send({ name: 'Run', target_amount: 1000 })).body.id;
    const rows = [
      { direction: 'in', amount: 0.1, category: 'other', source_type: 'test', source_id: 1, occurred_at: new Date('2026-01-15T10:00:00Z'), memo: '=HYPERLINK("http://evil")' },
      { direction: 'in', amount: 0.2, category: 'other', source_type: 'test', source_id: 2, occurred_at: new Date('2026-02-15T10:00:00Z') },
    ];
    await db('ledger_entries').insert(rows);
  });

  it('period filters and month grouping work on SQLite; totals are rounded to paise', async () => {
    const all = (await request(app).get('/api/finance/summary').set(auth('member'))).body;
    expect(all.total_in).toBe(0.3);
    const jan = (await request(app).get('/api/finance/summary?from=2026-01-01&to=2026-01-31').set(auth('member'))).body;
    expect(jan.total_in).toBe(0.1);
    expect(all.by_month.map((m: any) => m.month)).toEqual(expect.arrayContaining(['2026-01', '2026-02']));
    expect((await request(app).get('/api/admin/finance/ledger?from=2026-02-01&to=2026-02-28').set(auth('admin'))).body).toHaveLength(1);
  });

  it('ledger rejects bad limits; CSV export is not cut at the page size and neutralises formulas', async () => {
    expect((await request(app).get('/api/admin/finance/ledger?limit=-1').set(auth('admin'))).status).toBe(400);
    expect((await request(app).get('/api/admin/finance/ledger?limit=1e9').set(auth('admin'))).status).toBe(400);
    await getDb().batchInsert('ledger_entries', Array.from({ length: 520 }, (_, i) => ({ direction: 'in', amount: 1, category: 'other', source_type: 'bulk', source_id: i + 1, occurred_at: new Date('2025-06-01T00:00:00Z') })), 100);
    expect((await request(app).get('/api/admin/finance/ledger').set(auth('admin'))).body).toHaveLength(500);
    const csv = await request(app).get('/api/admin/finance/ledger?format=csv').set(auth('admin'));
    expect(csv.text.split('\n').length).toBe(1 + 522);
    expect(csv.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv.text).toMatch(/"2026-01-15T10:00:00\.000Z"/);
  });

  it('fundraiser raised/spent are net of reversals; reversing twice is a 409', async () => {
    const cash = await request(app).post(`/api/admin/fundraisers/${fid}/cash-income`).set(auth('admin')).send({ amount: 400 });
    expect((await request(app).get(`/api/fundraisers/${fid}`).set(auth('member'))).body.raised).toBe(400);
    expect((await request(app).post(`/api/admin/finance/ledger/${cash.body.id}/reverse`).set(auth('admin')).send({ memo: 'typo' })).status).toBe(201);
    expect((await request(app).post(`/api/admin/finance/ledger/${cash.body.id}/reverse`).set(auth('admin')).send({ memo: 'again' })).status).toBe(409);
    const f = (await request(app).get(`/api/fundraisers/${fid}`).set(auth('member'))).body;
    expect(f.raised).toBe(0); expect(f.spent).toBe(0); expect(f.progress).toBe(0);
  });
});

describe('fundraisers & tasks', () => {
  let fid: number;
  beforeAll(async () => { fid = (await request(app).post('/api/admin/fundraisers').set(auth('admin')).send({ name: 'Bake' })).body.id; });

  it('PATCH: unknown id 404, empty body is a no-op', async () => {
    expect((await request(app).patch('/api/admin/fundraisers/999999').set(auth('admin')).send({ status: 'active' })).status).toBe(404);
    expect((await request(app).patch(`/api/admin/fundraisers/${fid}`).set(auth('admin')).send({})).status).toBe(200);
    expect((await request(app).post('/api/admin/fundraisers/999999/tasks').set(auth('admin')).send({ title: 'x' })).status).toBe(404);
  });

  it('only admins update tasks; done sets done_at; the board flags overdue work', async () => {
    const t = (await request(app).post(`/api/admin/fundraisers/${fid}/tasks`).set(auth('admin')).send({ title: 'Stall', due_on: '2020-01-01' })).body;
    expect((await request(app).patch(`/api/admin/tasks/${t.id}`).set(auth('member')).send({ assignee_id: users.member.id })).status).toBe(403);
    const ok = await request(app).patch(`/api/admin/tasks/${t.id}`).set(auth('admin')).send({ assignee_id: users.admin2.id, status: 'doing' });
    expect(ok.status).toBe(200); expect(ok.body.assignee_id).toBe(users.admin2.id);
    expect((await request(app).patch(`/api/admin/tasks/${t.id}`).set(auth('admin')).send({ assignee_id: 424242 })).status).toBe(400);
    const board = (await request(app).get(`/api/admin/fundraisers/${fid}/tasks`).set(auth('admin'))).body;
    expect(board.find((x: any) => x.id === t.id).overdue).toBe(true);
    const done = await request(app).patch(`/api/admin/tasks/${t.id}`).set(auth('admin')).send({ status: 'done' });
    expect(done.body.done_at).toBeTruthy();
  });
});

describe('AI secretary proposals', () => {
  it('only the requesting user can confirm, and concurrent confirms execute once', async () => {
    const d = await request(app).post('/api/ai/ask').set(auth('admin')).send({ prompt: 'draft an announcement about <b>the gala</b>' });
    const id = d.body.proposal.id;
    expect((await request(app).post(`/api/ai/confirm/${id}`).set(auth('admin2'))).status).toBe(403);
    const before = (await getDb()('announcements')).length;
    const [a, b] = await Promise.all([request(app).post(`/api/ai/confirm/${id}`).set(auth('admin')), request(app).post(`/api/ai/confirm/${id}`).set(auth('admin'))]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect((await getDb()('announcements')).length).toBe(before + 1);
  });

  it('expense-review proposals are validated before they are stored', async () => {
    const { buildTools } = await import('../src/modules/ai/tools');
    const tool = buildTools(getDb(), { id: users.admin.id, role: 'admin', email: 'a' }).find((t) => t.name === 'proposeExpenseReview')!;
    expect(await tool.run({ id: 1, decision: 'paid' })).toHaveProperty('error');
    expect((await tool.run({ id: '1', decision: 'approved' })).__proposal.payload).toEqual({ id: 1, decision: 'approved' });
    await expect(tool.execute!({ id: 1, decision: 'paid' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('AI secretary roles', () => {
  it('users get the finance summary only; admins get the admin tools', async () => {
    const u = await request(app).post('/api/ai/ask').set(auth('member')).send({ prompt: 'any flagged expenses?' });
    expect(u.body.answer).not.toMatch(/flagged expenses:/); expect(u.body.answer).toMatch(/getFinanceSummary/); expect(u.body.answer).not.toMatch(/getFlaggedExpenses/);
    const a = await request(app).post('/api/ai/ask').set(auth('admin')).send({ prompt: 'any flagged expenses?' });
    expect(a.body.tool_calls.map((c: any) => c.name)).toEqual(['getFlaggedExpenses']);
  });
});
