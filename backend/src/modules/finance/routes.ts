import { Router, raw } from 'express';
import { z } from 'zod';
import { requireRole, requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import { badRequest } from '../../lib/errors';
import { ALLOWED_UPLOAD_MIMES, MAX_UPLOAD_BYTES } from '../../lib/storage';
import { safeEqual } from '../../lib/hash';
import * as svc from './service';

export const expensesRouter = Router();
export const financeRouter = Router();

const idParam = z.object({ id: z.coerce.number().int().positive() });
const expenseBody = z.object({
  amount: z.coerce.number().positive().max(1e9), category: z.string().min(1).max(60), description: z.string().max(2000).optional(),
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
// z.coerce.boolean() turns the string "false" into true, so `?mine=false` filtered to own expenses and `?flagged=false` to flagged ones.
const queryBool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');
expensesRouter.get('/', requireAuth, validate({ query: z.object({ status: z.string().optional(), flagged: queryBool.optional(), mine: queryBool.optional() }) }), asyncHandler(async (req, res) => {
  res.json(await svc.listExpenses(req.user!, req.query as any));
}));
/** Receipt bytes behind the signed link that list rows carry for inline (data:) receipts; see svc.listExpenses. */
expensesRouter.get('/:id/receipt', validate({ params: idParam, query: z.object({ exp: z.coerce.number().int(), sig: z.string().regex(/^[0-9a-f]{64}$/) }) }), asyncHandler(async (req, res) => {
  const id = Number(req.params.id); const { exp, sig } = req.query as unknown as { exp: number; sig: string };
  if (exp < Date.now() / 1000 || !safeEqual(svc.receiptSig(id, exp), sig)) return res.status(403).json({ error: 'Receipt link expired or invalid' });
  const x = await svc.getExpense(id);
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(x?.receipt_url ?? '');
  if (!m || !ALLOWED_UPLOAD_MIMES.includes(m[1])) {
    if (x?.receipt_url && /^https:\/\//.test(x.receipt_url)) return res.redirect(x.receipt_url);
    return res.status(404).json({ error: 'Not found' });
  }
  res.setHeader('Content-Type', m[1]); res.setHeader('Content-Disposition', 'inline'); res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(Buffer.from(m[2], 'base64'));
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
financeRouter.get('/ledger', requireRole('treasurer'), validate({ query: periodQuery.extend({ category: z.string().optional(), format: z.enum(['json', 'csv']).optional(), limit: z.coerce.number().int().min(1).max(5000).optional(), offset: z.coerce.number().int().min(0).optional() }) }), asyncHandler(async (req, res) => {
  const q = req.query as any;
  // The CSV export is the treasurer's full book: don't silently cut it at the 500-row page size.
  const rows = await svc.ledger(q.format === 'csv' && q.limit === undefined ? { ...q, limit: null } : q);
  if (q.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="ledger.csv"');
    return res.send(svc.toCsv(rows));
  }
  res.json(rows);
}));
financeRouter.post('/ledger/:id/reverse', requireRole('treasurer'), validate({ params: idParam, body: z.object({ memo: z.string().min(1).max(400) }) }), asyncHandler(async (req, res) => {
  const id = await svc.reverseEntry(req.user!.id, Number(req.params.id), req.body.memo);
  res.status(201).json({ id });
}));
