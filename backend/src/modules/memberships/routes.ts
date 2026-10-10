import { Router } from 'express';
import { z } from 'zod';
import { requireRole, requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import * as svc from './service';
import { cashDuesSchema, idParam, listMembersQuery, startDuesSchema, verifyQuery } from './schemas';

export const membershipsRouter = Router();
export const membersRouter = Router();

membershipsRouter.post('/', requireRole('member'), validate({ body: startDuesSchema }), asyncHandler(async (req, res) => {
  // Dues are set by the club; a client-sent `amount` is ignored (it used to let a member pay ₹1 for a membership).
  res.status(201).json(await svc.startDues(req.user!.id));
}));

membersRouter.get('/', requireRole('admin', 'treasurer'), validate({ query: listMembersQuery }), asyncHandler(async (req, res) => {
  res.json(await svc.listMembers(req.query as any));
}));
membersRouter.get('/:id/verify', requireRole('volunteer', 'treasurer'), validate({ params: z.object({ id: z.string() }), query: verifyQuery }), asyncHandler(async (req, res) => {
  res.json(await svc.verifyMember(req.params.id, (req.query as any).qr_token));
}));
membersRouter.post('/:id/cash-payment', requireRole('treasurer'), validate({ params: idParam, body: cashDuesSchema }), asyncHandler(async (req, res) => {
  res.status(201).json(await svc.recordCashDues(req.user!.id, Number(req.params.id), req.body.amount, req.body.expiry_date));
}));
membersRouter.use(requireAuth);
