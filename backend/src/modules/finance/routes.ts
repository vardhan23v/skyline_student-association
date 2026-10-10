import { Router, raw } from 'express';
import { z } from 'zod';
import { requireRole, requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import { badRequest } from '../../lib/errors';
import { ALLOWED_UPLOAD_MIMES, MAX_UPLOAD_BYTES } from '../../lib/storage';
import * as svc from './service';

export const expensesRouter = Router();
export const financeRouter = Router();

const idParam = z.object({ id: z.coerce.number().int().positive() });
const expenseBody = z.object({
  amount: z.coerce.number().positive(), category: z.string().min(1).max(60), description: z.string().max(2000).optional(),
  event_id: z.coerce.number().int().positive().optional(), fundraiser_id: z.coerce.number().int().positive().optional(),
});

/**
 * POST /expenses — JSON body, or `multipart/form-data` is NOT used; instead the receipt comes as a raw upload in a second
 * step to keep dependencies small: clients send JSON with `receipt_base64` + `receipt_mime` (≤5 MB).
 */
expensesRouter.post('/', requireRole('volunteer', 'treasurer'), validate({ body: expenseBody.extend({ receipt_base64: z.string().optional(), receipt_mime: z.string().optional() }) }), asyncHandler(async (req, res) => {
  const { receipt_base64, receipt_mime, ...input } = req.body;
  let file: { buffer: Buffer; mimetype: string } | undefined;
  if (receipt_base64) {
    if (!receipt_mime || !ALLOWED_UPLOAD_MIMES.includes(receipt_mime)) throw badRequest('Receipt must be jpeg, png or pdf');
    const buffer = Buffer.from(receipt_base64, 'base64');
    if (buffer.length > MAX_UPLOAD_BYTES) throw badRequest('Receipt exceeds 5 MB');
    file = { buffer, mimetype: receipt_mime };
  }
  res.status(201).json(await svc.submitExpense(req.user!.id, input, file));
}));
expensesRouter.get('/', requireAuth, validate({ query: z.object({ status: z.string().optional(), flagged: z.coerce.boolean().optional(), mine: z.coerce.boolean().optional() }) }), asyncHandler(async (req, res) => {
  res.json(await svc.listExpenses(req.user!, req.query as any));
}));
expensesRouter.get('/:id', requireAuth, validate({ params: idParam }), asyncHandler(async (req, res) => {
  const x = await svc.getExpense(Number(req.params.id));
  if (!x || (req.user!.role !== 'treasurer' && x.submitted_by !== req.user!.id)) return res.status(404).json({ error: 'Not found' });
  res.json(x);
}));
expensesRouter.patch('/:id/review', requireRole('treasurer'), validate({ params: idParam, body: z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().max(1000).optional() }) }), asyncHandler(async (req, res) => {
  res.json(await svc.reviewExpense(req.user!.id, Number(req.params.id), req.body.decision, req.body.note));
}));
expensesRouter.patch('/:id/pay', requireRole('treasurer'), validate({ params: idParam }), asyncHandler(async (req, res) => {
  res.json(await svc.payExpense(req.user!.id, Number(req.params.id)));
}));

const periodQuery = z.object({ from: z.string().date().optional(), to: z.string().date().optional() });
financeRouter.get('/summary', requireAuth, validate({ query: periodQuery }), asyncHandler(async (req, res) => {
  res.json(await svc.summary(req.query as any));
}));
financeRouter.get('/ledger', requireRole('treasurer'), validate({ query: periodQuery.extend({ category: z.string().optional(), format: z.enum(['json', 'csv']).optional(), limit: z.coerce.number().optional(), offset: z.coerce.number().optional() }) }), asyncHandler(async (req, res) => {
  const rows = await svc.ledger(req.query as any);
  if ((req.query as any).format === 'csv') {
    res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="ledger.csv"');
    return res.send(svc.toCsv(rows));
  }
  res.json(rows);
}));
financeRouter.post('/ledger/:id/reverse', requireRole('treasurer'), validate({ params: idParam, body: z.object({ memo: z.string().min(1).max(400) }) }), asyncHandler(async (req, res) => {
  const id = await svc.reverseEntry(req.user!.id, Number(req.params.id), req.body.memo);
  res.status(201).json({ id });
}));
