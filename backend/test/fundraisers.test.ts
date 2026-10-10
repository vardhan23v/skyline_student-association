import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { freshDb, getDb } from './setup';
import { createApp } from '../src/app';
import { signToken, type Role } from '../src/middleware/auth';
import { addDaysYmd, todayYmd } from '../src/lib/dates';
import { fundraiserHealth } from '../src/modules/fundraisers/routes';

let app: ReturnType<typeof createApp>;
const users: Record<string, { id: number; token: string }> = {};
const auth = (who: string) => ({ Authorization: `Bearer ${users[who].token}` });
const today = () => todayYmd();
const fundraiser = async (body: Record<string, unknown>) => (await request(app).post('/api/admin/fundraisers').set(auth('admin')).send(body)).body;
const task = async (fid: number, body: Record<string, unknown>) => request(app).post(`/api/admin/fundraisers/${fid}/tasks`).set(auth('admin')).send(body);
const get = async (fid: number) => (await request(app).get(`/api/admin/fundraisers/${fid}`).set(auth('admin'))).body;

beforeAll(async () => {
  await freshDb();
  app = createApp();
  for (const [name, role] of [['admin', 'admin'], ['core', 'admin'], ['user', 'user']] as [string, Role][]) {
    const [id] = await getDb()('users').insert({ name: `${name} name`, email: `${name}@fr.test`, password_hash: 'x', role });
    users[name] = { id: id as number, token: signToken({ id: id as number, role, email: `${name}@fr.test` }) };
  }
});

describe('fundraisers: access', () => {
  it('admins create fundraisers; users get 403 on every fundraiser and task endpoint', async () => {
    const f = await fundraiser({ name: 'Access', target_amount: 100, status: 'active' });
    expect(f.id).toBeTruthy();
    const t = (await task(f.id, { title: 'x' })).body;
    const calls: [string, string][] = [
      ['get', '/api/fundraisers'], ['get', `/api/fundraisers/${f.id}`],
      ['get', '/api/admin/fundraisers'], ['post', '/api/admin/fundraisers'], ['get', `/api/admin/fundraisers/${f.id}`], ['patch', `/api/admin/fundraisers/${f.id}`],
      ['get', `/api/admin/fundraisers/${f.id}/tasks`], ['post', `/api/admin/fundraisers/${f.id}/tasks`], ['post', `/api/admin/fundraisers/${f.id}/cash-income`],
      ['get', '/api/admin/tasks'], ['patch', `/api/admin/tasks/${t.id}`], ['get', '/api/admin/users?role=admin'],
    ];
    for (const [m, path] of calls) expect([m, path, (await (request(app) as any)[m](path).set(auth('user')).send({ name: 'x', amount: 1 })).status]).toEqual([m, path, 403]);
  });

  it('lists admins for the assignee picker', async () => {
    const r = (await request(app).get('/api/admin/users?role=admin').set(auth('admin'))).body;
    expect(r.map((u: any) => u.email).sort()).toEqual(['admin@fr.test', 'core@fr.test']);
    expect(Object.keys(r[0]).sort()).toEqual(['email', 'id', 'name']);
  });
});

describe('fundraisers: tasks', () => {
  let fid: number;
  beforeAll(async () => { fid = (await fundraiser({ name: 'Tasks', target_amount: 1000, status: 'active' })).id; });

  it('assigns only to admins: another admin is fine, a user or a missing id is INVALID_ASSIGNEE', async () => {
    const ok = await task(fid, { title: 'Posters', assignee_id: users.core.id });
    expect(ok.status).toBe(201);
    expect(ok.body.assignee).toEqual({ id: users.core.id, name: 'core name' });
    for (const assignee_id of [users.user.id, 424242]) {
      const bad = await task(fid, { title: 'Nope', assignee_id });
      expect([bad.status, bad.body.code]).toEqual([400, 'INVALID_ASSIGNEE']);
      const patch = await request(app).patch(`/api/admin/tasks/${ok.body.id}`).set(auth('admin')).send({ assignee_id });
      expect([patch.status, patch.body.code]).toEqual([400, 'INVALID_ASSIGNEE']);
    }
    // Inactive admins can't take new work either; unassigning is allowed.
    await getDb()('users').where({ id: users.core.id }).update({ is_active: false });
    expect((await task(fid, { title: 'Nope', assignee_id: users.core.id })).body.code).toBe('INVALID_ASSIGNEE');
    await getDb()('users').where({ id: users.core.id }).update({ is_active: true });
    expect((await request(app).patch(`/api/admin/tasks/${ok.body.id}`).set(auth('admin')).send({ assignee_id: null })).body.assignee).toBeNull();
  });

  it('persists status changes and sets / clears done_at', async () => {
    const t = (await task(fid, { title: 'Stall' })).body;
    const patch = (body: object) => request(app).patch(`/api/admin/tasks/${t.id}`).set(auth('admin')).send(body);
    expect((await patch({ status: 'doing' })).body).toMatchObject({ status: 'doing', done_at: null });
    const done = (await patch({ status: 'done' })).body;
    expect(done.status).toBe('done'); expect(done.done_at).toBeTruthy();
    expect((await patch({ status: 'todo' })).body).toMatchObject({ status: 'todo', done_at: null });
    expect((await getDb()('tasks').where({ id: t.id }).first()).status).toBe('todo');
  });

  it('flags overdue work (due yesterday, not done) and sorts it first', async () => {
    const late = (await task(fid, { title: 'Late', due_on: addDaysYmd(today(), -1) })).body;
    const soon = (await task(fid, { title: 'Soon', due_on: addDaysYmd(today(), 3) })).body;
    expect(late.overdue).toBe(true); expect(soon.overdue).toBe(false);
    const board = (await request(app).get(`/api/admin/fundraisers/${fid}/tasks`).set(auth('admin'))).body;
    expect(board[0].id).toBe(late.id);
    expect(board[0]).toHaveProperty('created_at'); expect(board[0]).toHaveProperty('updated_at');
    const only = (await request(app).get(`/api/admin/tasks?fundraiser_id=${fid}&overdue=true`).set(auth('admin'))).body;
    expect(only.map((x: any) => x.id)).toEqual([late.id]);
    const done = (await request(app).patch(`/api/admin/tasks/${late.id}`).set(auth('admin')).send({ status: 'done' })).body;
    expect(done.overdue).toBe(false);
    expect((await request(app).get(`/api/admin/tasks?fundraiser_id=${fid}&overdue=true`).set(auth('admin'))).body).toEqual([]);
    expect((await request(app).get(`/api/admin/tasks?fundraiser_id=${fid}&status=done`).set(auth('admin'))).body.map((x: any) => x.id)).toEqual([late.id]);
  });
});

describe('fundraisers: progress and health', () => {
  it('progress_pct comes from the ledger: ₹3,500 of ₹10,000 is 35.0, reversals are not counted, no target is null', async () => {
    const f = await fundraiser({ name: 'Bake Sale', target_amount: 10000, status: 'active', ends_on: addDaysYmd(today(), 10) });
    await request(app).post(`/api/admin/fundraisers/${f.id}/cash-income`).set(auth('admin')).send({ amount: 3500 });
    const wrong = (await request(app).post(`/api/admin/fundraisers/${f.id}/cash-income`).set(auth('admin')).send({ amount: 999 })).body;
    await request(app).post(`/api/admin/finance/ledger/${wrong.id}/reverse`).set(auth('admin')).send({ memo: 'typo' });
    const g = await get(f.id);
    expect(g).toMatchObject({ raised: 3500, target_amount: 10000, progress_pct: 35, days_left: 10, task_completion_pct: null, health: 'on_track' });
    // The ledger has the cash once (plus the reversed pair), and a client-sent `raised` is ignored.
    expect(await getDb()('ledger_entries').where({ fundraiser_id: f.id, source_type: 'cash_receipt', amount: 3500 }).count({ n: '*' })).toEqual([{ n: 1 }]);
    await request(app).patch(`/api/admin/fundraisers/${f.id}`).set(auth('admin')).send({ raised: 9999 });
    expect((await get(f.id)).raised).toBe(3500);
    expect((await fundraiser({ name: 'No target' })).progress_pct).toBeNull();
  });

  it('reports task counts, completion and assignees', async () => {
    const f = await fundraiser({ name: 'Counts', target_amount: 500, status: 'active' });
    await task(f.id, { title: 'a', status: 'done', assignee_id: users.admin.id });
    await task(f.id, { title: 'b', status: 'doing', assignee_id: users.core.id });
    await task(f.id, { title: 'c', assignee_id: users.core.id });
    await task(f.id, { title: 'd' });
    expect(await get(f.id)).toMatchObject({ tasks_total: 4, tasks_todo: 2, tasks_doing: 1, tasks_done: 1, task_completion_pct: 25, assignees: ['admin name', 'core name'] });
  });

  it('applies each health rule', async () => {
    const base = { status: 'active', target_amount: 1000, raised: 0, tasks_total: 1, tasks_overdue: 0, days_left: 5 };
    expect(fundraiserHealth({ ...base, status: 'completed', tasks_overdue: 3 })).toBe('completed');
    expect(fundraiserHealth({ ...base, status: 'cancelled' })).toBe('cancelled');
    expect(fundraiserHealth({ ...base, target_amount: 0, tasks_total: 0 })).toBe('no_data');
    expect(fundraiserHealth({ ...base, tasks_overdue: 1 })).toBe('behind');
    expect(fundraiserHealth({ ...base, days_left: -1, raised: 999 })).toBe('behind');
    expect(fundraiserHealth({ ...base, days_left: -1, raised: 1000 })).toBe('on_track');
    expect(fundraiserHealth({ ...base, days_left: null })).toBe('on_track');
    expect(fundraiserHealth(base)).toBe('on_track');

    // And end to end through the API.
    const behind = await fundraiser({ name: 'Ended short', target_amount: 1000, status: 'active', ends_on: addDaysYmd(today(), -1) });
    expect(behind).toMatchObject({ days_left: -1, health: 'behind' });
    expect((await fundraiser({ name: 'Empty', status: 'planned' })).health).toBe('no_data');
    expect((await fundraiser({ name: 'Done', target_amount: 10, status: 'completed' })).health).toBe('completed');
    const overdue = await fundraiser({ name: 'Overdue', target_amount: 1000, status: 'active' });
    const t = (await task(overdue.id, { title: 'late', due_on: addDaysYmd(today(), -2) })).body;
    expect((await get(overdue.id)).health).toBe('behind');
    await request(app).patch(`/api/admin/tasks/${t.id}`).set(auth('admin')).send({ status: 'done' });
    expect((await get(overdue.id)).health).toBe('on_track');
  });

  it('rejects the old status values', async () => {
    expect((await request(app).post('/api/admin/fundraisers').set(auth('admin')).send({ name: 'Old', status: 'planning' })).status).toBe(400);
    expect((await fundraiser({ name: 'Default' })).status).toBe('planned');
  });

  it('counts active and behind fundraisers on the admin overview', async () => {
    const o = (await request(app).get('/api/admin/overview').set(auth('admin'))).body;
    const all = (await request(app).get('/api/admin/fundraisers').set(auth('admin'))).body.filter((f: any) => f.status === 'active');
    expect(o.fundraisers).toEqual({ active: all.length, behind: all.filter((f: any) => f.health === 'behind').length });
    expect(o.fundraisers.behind).toBeGreaterThan(0);
  });
});

describe('fundraiser_status migration', () => {
  it('maps planning → planned and closed → completed, and back on rollback', async () => {
    const db = await freshDb();
    await db.migrate.down(); // undo the latest migration: fundraiser_status
    await db('fundraisers').insert([{ name: 'p', status: 'planning' }, { name: 'a', status: 'active' }, { name: 'c', status: 'closed' }]);
    await db.migrate.latest();
    expect(await db('fundraisers').orderBy('id').pluck('status')).toEqual(['planned', 'active', 'completed']);
    await expect(db('fundraisers').insert({ name: 'x', status: 'planning' })).rejects.toThrow();
    // The table rebuild kept the foreign keys working.
    const [fid] = await db('fundraisers').insert({ name: 'fk' });
    await db('tasks').insert({ fundraiser_id: fid, title: 't' });
    const idx = (await db.raw('PRAGMA index_list(`tasks`)')).map((i: any) => i.name);
    expect(idx).toEqual(expect.arrayContaining(['tasks_fundraiser_status_index', 'tasks_assignee_index']));
    await db('fundraisers').insert({ name: 'gone', status: 'cancelled' });
    await db.migrate.down();
    expect(await db('fundraisers').orderBy('id').pluck('status')).toEqual(['planning', 'active', 'closed', 'planning', 'closed']);
  });
});
