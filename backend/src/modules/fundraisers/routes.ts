import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../config/db';
import { requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import { HttpError, notFound } from '../../lib/errors';
import { recordFundraiserCash } from '../finance/service';
import { todayYmd, ymdOf } from '../../lib/dates';

/** /api/fundraisers: the same admin-only reads as /api/admin/fundraisers (fundraiser data is internal). */
export const fundraisersRouter = Router();
fundraisersRouter.use(requireRole('admin'));
/** Mounted at /api/admin/fundraisers and /api/admin/tasks (the admin router enforces requireRole('admin')). */
export const adminFundraisersRouter = Router();
export const adminTasksRouter = Router();
const idParam = z.object({ id: z.coerce.number().int().positive() });
export const FUNDRAISER_STATUSES = ['planned', 'active', 'completed', 'cancelled'] as const;
const fundraiserBody = z.object({ name: z.string().min(1).max(200), description: z.string().max(5000).optional(), target_amount: z.coerce.number().min(0).max(1e9).default(0), budget: z.coerce.number().min(0).max(1e9).optional(), starts_on: z.string().date().nullable().optional(), ends_on: z.string().date().nullable().optional(), status: z.enum(FUNDRAISER_STATUSES).optional() });
const taskBody = z.object({ title: z.string().min(1).max(200), assignee_id: z.coerce.number().int().positive().nullable().optional(), due_on: z.string().date().nullable().optional(), status: z.enum(['todo', 'doing', 'done']).optional() });
const taskQuery = z.object({ fundraiser_id: z.coerce.number().int().positive().optional(), assignee_id: z.coerce.number().int().positive().optional(), status: z.enum(['todo', 'doing', 'done']).optional(), overdue: z.enum(['true', 'false']).optional() });

export type Health = 'completed' | 'cancelled' | 'no_data' | 'behind' | 'on_track';
/**
 * Whether a fundraiser is on track. First match wins:
 * 1. `completed` / `cancelled`: the fundraiser's own status says so.
 * 2. `no_data`: no target (0) and no tasks, so there is nothing to measure.
 * 3. `behind`: any task is overdue, or the end date has passed (days_left < 0) and raised < target.
 * 4. `on_track`: otherwise.
 * Documented in docs/architecture.md (Fundraisers & tasks).
 */
export function fundraiserHealth(f: { status: string; target_amount: number; raised: number; tasks_total: number; tasks_overdue: number; days_left: number | null }): Health {
  if (f.status === 'completed' || f.status === 'cancelled') return f.status;
  if (f.target_amount === 0 && f.tasks_total === 0) return 'no_data';
  if (f.tasks_overdue > 0 || (f.days_left != null && f.days_left < 0 && f.raised < f.target_amount)) return 'behind';
  return 'on_track';
}

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD). */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Raised and spent are ledger sums (never stored or taken from the client); tasks, days left and health are derived too. */
export async function fundraiserProgress(ids?: number[], where?: { status?: string }) {
  const db = getDb();
  const rows = await db('fundraisers').modify((qb) => { if (ids) qb.whereIn('id', ids); if (where?.status) qb.where('status', where.status); }).orderBy('id', 'desc');
  const fids = rows.map((r: any) => r.id);
  const today = todayYmd(); // club calendar day, not the UTC date
  const [raised, tasks, overdue, names] = await Promise.all([
    db('ledger_entries').whereIn('fundraiser_id', fids).select('fundraiser_id', 'category', 'direction').sum({ total: 'amount' }).groupBy('fundraiser_id', 'category', 'direction'),
    db('tasks').whereIn('fundraiser_id', fids).select('fundraiser_id', 'status').count({ n: '*' }).groupBy('fundraiser_id', 'status'),
    db('tasks').whereIn('fundraiser_id', fids).where('due_on', '<', today).whereNot('status', 'done').select('fundraiser_id').count({ n: '*' }).groupBy('fundraiser_id'),
    db('tasks as t').join('users as u', 'u.id', 't.assignee_id').whereIn('t.fundraiser_id', fids).distinct('t.fundraiser_id', 'u.name').orderBy('u.name'),
  ]);
  return rows.map((f: any) => {
    // Net of reversals: a reversal keeps the category with the opposite direction, so income nets as in−out and
    // reimbursements as out−in. Previously a reversed ₹10,000 cash entry still counted as raised (and as spent).
    const net = (pred: (r: any) => boolean) => raised.filter((r: any) => Number(r.fundraiser_id) === Number(f.id) && pred(r))
      .reduce((a, r: any) => a + (r.direction === 'in' ? 1 : -1) * Number(r.total ?? 0), 0);
    const raisedNet = Math.round(net((r) => r.category !== 'reimbursement') * 100) / 100;
    const spentNet = Math.round(-net((r) => r.category === 'reimbursement') * 100) / 100;
    const t = (s?: string) => tasks.filter((x: any) => Number(x.fundraiser_id) === Number(f.id) && (!s || x.status === s)).reduce((a, x: any) => a + Number(x.n), 0);
    const target = Number(f.target_amount);
    const out = {
      ...f, target_amount: target, raised: raisedNet, spent: spentNet,
      progress: target > 0 ? Math.max(0, Math.min(1, raisedNet / target)) : null,
      progress_pct: target > 0 ? Math.round((raisedNet / target) * 1000) / 10 : null, // uncapped; the UI caps the bar
      tasks_total: t(), tasks_todo: t('todo'), tasks_doing: t('doing'), tasks_done: t('done'),
      tasks_overdue: Number(overdue.find((o: any) => Number(o.fundraiser_id) === Number(f.id))?.n ?? 0),
      days_left: f.ends_on ? daysBetween(today, ymdOf(f.ends_on)) : null,
      assignees: names.filter((n: any) => Number(n.fundraiser_id) === Number(f.id)).map((n: any) => n.name as string),
    };
    return { ...out, task_completion_pct: out.tasks_total ? Math.round((out.tasks_done / out.tasks_total) * 1000) / 10 : null, health: fundraiserHealth(out) };
  });
}

/** Tasks with their assignee and overdue flag: overdue first, then by due date (undated last). */
export async function listTasks(f: { id?: number; fundraiser_id?: number; assignee_id?: number; status?: string; overdue?: boolean }) {
  const today = todayYmd();
  const rows = await getDb()('tasks as t').leftJoin('users as u', 'u.id', 't.assignee_id').select('t.*', 'u.name as assignee_name')
    .modify((qb) => {
      if (f.id) qb.where('t.id', f.id);
      if (f.fundraiser_id) qb.where('t.fundraiser_id', f.fundraiser_id);
      if (f.assignee_id) qb.where('t.assignee_id', f.assignee_id);
      if (f.status) qb.where('t.status', f.status);
      if (f.overdue) qb.where('t.due_on', '<', today).whereNot('t.status', 'done');
    });
  return rows.map(({ assignee_name, ...t }: any) => ({
    ...t,
    due_on: t.due_on ? ymdOf(t.due_on) : null,
    assignee: t.assignee_id ? { id: Number(t.assignee_id), name: assignee_name } : null,
    // String(Date) on MySQL is "Sat Oct 10 …", which never compares < '2026-…', so nothing was ever overdue there.
    overdue: !!t.due_on && ymdOf(t.due_on) < today && t.status !== 'done',
  })).sort((a: any, b: any) => Number(b.overdue) - Number(a.overdue) || (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || a.id - b.id);
}

/** A task can only be assigned to an active admin (or nobody). */
async function checkAssignee(assignee_id: number | null | undefined) {
  if (assignee_id == null) return;
  if (!(await getDb()('users').where({ id: assignee_id, role: 'admin', is_active: true }).first())) throw new HttpError(400, 'Tasks can only be assigned to an active admin', 'INVALID_ASSIGNEE');
}

const list = asyncHandler(async (_req, res) => res.json(await fundraiserProgress()));
const one = asyncHandler(async (req, res) => {
  const [f] = await fundraiserProgress([Number(req.params.id)]);
  if (!f) throw notFound('Fundraiser not found');
  res.json(f);
});
fundraisersRouter.get('/', list);
fundraisersRouter.get('/:id', validate({ params: idParam }), one);

adminFundraisersRouter.get('/', list);
adminFundraisersRouter.post('/', validate({ body: fundraiserBody }), asyncHandler(async (req, res) => {
  const [id] = await getDb()('fundraisers').insert(req.body);
  res.status(201).json((await fundraiserProgress([id as number]))[0]);
}));
adminFundraisersRouter.get('/:id', validate({ params: idParam }), one);
adminFundraisersRouter.patch('/:id', validate({ params: idParam, body: fundraiserBody.partial() }), asyncHandler(async (req, res) => {
  // Unknown id used to answer 200 with an empty body; an empty patch threw knex's "Empty .update()" → 500.
  if (!(await getDb()('fundraisers').where({ id: req.params.id }).first())) throw notFound('Fundraiser not found');
  if (Object.keys(req.body).length) await getDb()('fundraisers').where({ id: req.params.id }).update({ ...req.body, updated_at: getDb().fn.now() });
  res.json((await fundraiserProgress([Number(req.params.id)]))[0]);
}));
adminFundraisersRouter.get('/:id/tasks', validate({ params: idParam }), asyncHandler(async (req, res) => {
  res.json(await listTasks({ fundraiser_id: Number(req.params.id) }));
}));
adminFundraisersRouter.post('/:id/tasks', validate({ params: idParam, body: taskBody }), asyncHandler(async (req, res) => {
  // Unknown fundraiser used to surface as a foreign-key error → 500.
  if (!(await getDb()('fundraisers').where({ id: req.params.id }).first())) throw notFound('Fundraiser not found');
  await checkAssignee(req.body.assignee_id);
  const patch: any = { ...req.body, fundraiser_id: req.params.id };
  if (patch.status === 'done') patch.done_at = new Date();
  const [id] = await getDb()('tasks').insert(patch);
  res.status(201).json((await listTasks({ id: id as number }))[0]);
}));
adminFundraisersRouter.post('/:id/cash-income', validate({ params: idParam, body: z.object({ amount: z.coerce.number().positive().max(1e9), memo: z.string().max(400).optional() }) }), asyncHandler(async (req, res) => {
  res.status(201).json(await recordFundraiserCash(req.user!.id, Number(req.params.id), req.body.amount, req.body.memo));
}));

adminTasksRouter.get('/', validate({ query: taskQuery }), asyncHandler(async (req, res) => {
  const q = req.query as z.infer<typeof taskQuery>;
  res.json(await listTasks({ fundraiser_id: q.fundraiser_id, assignee_id: q.assignee_id, status: q.status, overdue: q.overdue === 'true' }));
}));
adminTasksRouter.patch('/:id', validate({ params: idParam, body: taskBody.partial() }), asyncHandler(async (req, res) => {
  const db = getDb();
  const t = await db('tasks').where({ id: req.params.id }).first();
  if (!t) throw notFound('Task not found');
  if ('assignee_id' in req.body) await checkAssignee(req.body.assignee_id);
  const patch: any = { ...req.body };
  if (patch.status === 'done' && t.status !== 'done') patch.done_at = new Date();
  if (patch.status && patch.status !== 'done') patch.done_at = null;
  if (Object.keys(patch).length) await db('tasks').where({ id: t.id }).update({ ...patch, updated_at: db.fn.now() });
  res.json((await listTasks({ id: t.id }))[0]);
}));
