import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../config/db';
import { hasRole, requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import { forbidden, notFound } from '../../lib/errors';
import { recordFundraiserCash } from '../finance/service';

export const fundraisersRouter = Router();
export const tasksRouter = Router();
const idParam = z.object({ id: z.coerce.number().int().positive() });
const fundraiserBody = z.object({ name: z.string().min(1).max(200), description: z.string().optional(), target_amount: z.coerce.number().min(0).default(0), budget: z.coerce.number().min(0).optional(), starts_on: z.string().date().optional(), ends_on: z.string().date().optional(), status: z.enum(['planning', 'active', 'closed']).optional() });
const taskBody = z.object({ title: z.string().min(1).max(200), assignee_id: z.coerce.number().int().positive().nullable().optional(), due_on: z.string().date().nullable().optional(), status: z.enum(['todo', 'doing', 'done']).optional() });

/** Raised so far = ledger sum, not a stored column. */
export async function fundraiserProgress(ids?: number[]) {
  const db = getDb();
  const rows = await db('fundraisers').modify((qb) => { if (ids) qb.whereIn('id', ids); }).orderBy('id', 'desc');
  const raised = await db('ledger_entries').whereIn('fundraiser_id', rows.map((r: any) => r.id)).select('fundraiser_id', 'direction').sum({ total: 'amount' }).groupBy('fundraiser_id', 'direction');
  const tasks = await db('tasks').whereIn('fundraiser_id', rows.map((r: any) => r.id)).select('fundraiser_id', 'status').count({ n: '*' }).groupBy('fundraiser_id', 'status');
  const today = new Date().toISOString().slice(0, 10);
  const overdue = await db('tasks').whereIn('fundraiser_id', rows.map((r: any) => r.id)).where('due_on', '<', today).whereNot('status', 'done').select('fundraiser_id').count({ n: '*' }).groupBy('fundraiser_id');
  return rows.map((f: any) => {
    const sum = (d: string) => Number(raised.find((r: any) => r.fundraiser_id === f.id && r.direction === d)?.total ?? 0);
    const t = (s?: string) => tasks.filter((x: any) => x.fundraiser_id === f.id && (!s || x.status === s)).reduce((a, x: any) => a + Number(x.n), 0);
    return { ...f, raised: sum('in'), spent: sum('out'), progress: f.target_amount > 0 ? Math.min(1, sum('in') / Number(f.target_amount)) : null, tasks_total: t(), tasks_done: t('done'), tasks_overdue: Number(overdue.find((o: any) => o.fundraiser_id === f.id)?.n ?? 0) };
  });
}

fundraisersRouter.get('/', requireAuth, asyncHandler(async (_req, res) => res.json(await fundraiserProgress())));
fundraisersRouter.post('/', requireRole('admin'), validate({ body: fundraiserBody }), asyncHandler(async (req, res) => {
  const [id] = await getDb()('fundraisers').insert(req.body);
  res.status(201).json((await fundraiserProgress([id as number]))[0]);
}));
fundraisersRouter.get('/:id', requireAuth, validate({ params: idParam }), asyncHandler(async (req, res) => {
  const [f] = await fundraiserProgress([Number(req.params.id)]);
  if (!f) throw notFound('Fundraiser not found');
  res.json(f);
}));
fundraisersRouter.patch('/:id', requireRole('admin'), validate({ params: idParam, body: fundraiserBody.partial() }), asyncHandler(async (req, res) => {
  await getDb()('fundraisers').where({ id: req.params.id }).update(req.body);
  res.json((await fundraiserProgress([Number(req.params.id)]))[0]);
}));
fundraisersRouter.get('/:id/tasks', requireRole('volunteer', 'treasurer'), validate({ params: idParam }), asyncHandler(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await getDb()('tasks as t').leftJoin('users as u', 'u.id', 't.assignee_id').select('t.*', 'u.name as assignee_name').where('t.fundraiser_id', req.params.id).orderBy('t.due_on');
  res.json(rows.map((t: any) => ({ ...t, overdue: !!t.due_on && String(t.due_on).slice(0, 10) < today && t.status !== 'done' })));
}));
fundraisersRouter.post('/:id/tasks', requireRole('admin'), validate({ params: idParam, body: taskBody }), asyncHandler(async (req, res) => {
  const [id] = await getDb()('tasks').insert({ ...req.body, fundraiser_id: req.params.id });
  res.status(201).json(await getDb()('tasks').where({ id }).first());
}));
fundraisersRouter.post('/:id/cash-income', requireRole('treasurer'), validate({ params: idParam, body: z.object({ amount: z.coerce.number().positive(), memo: z.string().max(400).optional() }) }), asyncHandler(async (req, res) => {
  res.status(201).json(await recordFundraiserCash(req.user!.id, Number(req.params.id), req.body.amount, req.body.memo));
}));

tasksRouter.patch('/:id', requireAuth, validate({ params: idParam, body: taskBody.partial() }), asyncHandler(async (req, res) => {
  const db = getDb();
  const t = await db('tasks').where({ id: req.params.id }).first();
  if (!t) throw notFound('Task not found');
  if (!hasRole(req.user, 'admin') && t.assignee_id !== req.user!.id) throw forbidden('Only the assignee or an admin can update this task');
  const patch: any = { ...req.body };
  if (patch.status === 'done' && t.status !== 'done') patch.done_at = new Date();
  if (patch.status && patch.status !== 'done') patch.done_at = null;
  await db('tasks').where({ id: t.id }).update(patch);
  res.json(await db('tasks').where({ id: t.id }).first());
}));
