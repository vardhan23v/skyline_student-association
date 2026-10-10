import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../config/db';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import { badRequest, notFound } from '../../lib/errors';
import { recordFundraiserCash } from '../finance/service';
import { todayYmd, ymdOf } from '../../lib/dates';

export const fundraisersRouter = Router();
/** Mounted at /api/admin/fundraisers and /api/admin/tasks (the admin router enforces requireRole('admin')). */
export const adminFundraisersRouter = Router();
export const adminTasksRouter = Router();
const idParam = z.object({ id: z.coerce.number().int().positive() });
const fundraiserBody = z.object({ name: z.string().min(1).max(200), description: z.string().max(5000).optional(), target_amount: z.coerce.number().min(0).max(1e9).default(0), budget: z.coerce.number().min(0).max(1e9).optional(), starts_on: z.string().date().optional(), ends_on: z.string().date().optional(), status: z.enum(['planning', 'active', 'closed']).optional() });
const taskBody = z.object({ title: z.string().min(1).max(200), assignee_id: z.coerce.number().int().positive().nullable().optional(), due_on: z.string().date().nullable().optional(), status: z.enum(['todo', 'doing', 'done']).optional() });


/** Raised so far = ledger sum, not a stored column. */
export async function fundraiserProgress(ids?: number[]) {
  const db = getDb();
  const rows = await db('fundraisers').modify((qb) => { if (ids) qb.whereIn('id', ids); }).orderBy('id', 'desc');
  const raised = await db('ledger_entries').whereIn('fundraiser_id', rows.map((r: any) => r.id)).select('fundraiser_id', 'category', 'direction').sum({ total: 'amount' }).groupBy('fundraiser_id', 'category', 'direction');
  const tasks = await db('tasks').whereIn('fundraiser_id', rows.map((r: any) => r.id)).select('fundraiser_id', 'status').count({ n: '*' }).groupBy('fundraiser_id', 'status');
  const today = todayYmd(); // club calendar day, not the UTC date
  const overdue = await db('tasks').whereIn('fundraiser_id', rows.map((r: any) => r.id)).where('due_on', '<', today).whereNot('status', 'done').select('fundraiser_id').count({ n: '*' }).groupBy('fundraiser_id');
  return rows.map((f: any) => {
    // Net of reversals: a reversal keeps the category with the opposite direction, so income nets as in−out and
    // reimbursements as out−in. Previously a reversed ₹10,000 cash entry still counted as raised (and as spent).
    const net = (pred: (r: any) => boolean) => raised.filter((r: any) => Number(r.fundraiser_id) === Number(f.id) && pred(r))
      .reduce((a, r: any) => a + (r.direction === 'in' ? 1 : -1) * Number(r.total ?? 0), 0);
    const raisedNet = Math.round(net((r) => r.category !== 'reimbursement') * 100) / 100;
    const spentNet = Math.round(-net((r) => r.category === 'reimbursement') * 100) / 100;
    const t = (s?: string) => tasks.filter((x: any) => Number(x.fundraiser_id) === Number(f.id) && (!s || x.status === s)).reduce((a, x: any) => a + Number(x.n), 0);
    return { ...f, raised: raisedNet, spent: spentNet, progress: Number(f.target_amount) > 0 ? Math.max(0, Math.min(1, raisedNet / Number(f.target_amount))) : null, tasks_total: t(), tasks_done: t('done'), tasks_overdue: Number(overdue.find((o: any) => Number(o.fundraiser_id) === Number(f.id))?.n ?? 0) };
  });
}

fundraisersRouter.get('/', requireAuth, asyncHandler(async (_req, res) => res.json(await fundraiserProgress())));
adminFundraisersRouter.post('/', validate({ body: fundraiserBody }), asyncHandler(async (req, res) => {
  const [id] = await getDb()('fundraisers').insert(req.body);
  res.status(201).json((await fundraiserProgress([id as number]))[0]);
}));
fundraisersRouter.get('/:id', requireAuth, validate({ params: idParam }), asyncHandler(async (req, res) => {
  const [f] = await fundraiserProgress([Number(req.params.id)]);
  if (!f) throw notFound('Fundraiser not found');
  res.json(f);
}));
adminFundraisersRouter.patch('/:id', validate({ params: idParam, body: fundraiserBody.partial() }), asyncHandler(async (req, res) => {
  // Unknown id used to answer 200 with an empty body; an empty patch threw knex's "Empty .update()" → 500.
  if (!(await getDb()('fundraisers').where({ id: req.params.id }).first())) throw notFound('Fundraiser not found');
  if (Object.keys(req.body).length) await getDb()('fundraisers').where({ id: req.params.id }).update(req.body);
  res.json((await fundraiserProgress([Number(req.params.id)]))[0]);
}));
adminFundraisersRouter.get('/:id/tasks', validate({ params: idParam }), asyncHandler(async (req, res) => {
  const today = todayYmd(); // club calendar day, not the UTC date
  const rows = await getDb()('tasks as t').leftJoin('users as u', 'u.id', 't.assignee_id').select('t.*', 'u.name as assignee_name').where('t.fundraiser_id', req.params.id).orderBy('t.due_on');
  // String(Date) on MySQL is "Sat Oct 10 …", which never compares < '2026-…', so nothing was ever overdue there.
  res.json(rows.map((t: any) => ({ ...t, overdue: !!t.due_on && ymdOf(t.due_on) < today && t.status !== 'done' })));
}));
adminFundraisersRouter.post('/:id/tasks', validate({ params: idParam, body: taskBody }), asyncHandler(async (req, res) => {
  // Unknown fundraiser / assignee used to surface as a foreign-key error → 500.
  if (!(await getDb()('fundraisers').where({ id: req.params.id }).first())) throw notFound('Fundraiser not found');
  if (req.body.assignee_id && !(await getDb()('users').where({ id: req.body.assignee_id }).first())) throw badRequest('Assignee not found');
  const [id] = await getDb()('tasks').insert({ ...req.body, fundraiser_id: req.params.id });
  res.status(201).json(await getDb()('tasks').where({ id }).first());
}));
adminFundraisersRouter.post('/:id/cash-income', validate({ params: idParam, body: z.object({ amount: z.coerce.number().positive().max(1e9), memo: z.string().max(400).optional() }) }), asyncHandler(async (req, res) => {
  res.status(201).json(await recordFundraiserCash(req.user!.id, Number(req.params.id), req.body.amount, req.body.memo));
}));

adminTasksRouter.patch('/:id', validate({ params: idParam, body: taskBody.partial() }), asyncHandler(async (req, res) => {
  const db = getDb();
  const t = await db('tasks').where({ id: req.params.id }).first();
  if (!t) throw notFound('Task not found');
  if (req.body.assignee_id && !(await db('users').where({ id: req.body.assignee_id }).first())) throw badRequest('Assignee not found');
  const patch: any = { ...req.body };
  if (patch.status === 'done' && t.status !== 'done') patch.done_at = new Date();
  if (patch.status && patch.status !== 'done') patch.done_at = null;
  if (Object.keys(patch).length) await db('tasks').where({ id: t.id }).update(patch);
  res.json(await db('tasks').where({ id: t.id }).first());
}));
