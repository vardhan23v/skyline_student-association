import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import * as svc from './service';
import { cashDuesSchema, idParam, listMembersQuery, membershipOffer, startDuesSchema, verifyQuery } from './schemas';
import { academicYearEnd } from './service';

export const membershipsRouter = Router();
/** Mounted at /api/admin/members (the admin router enforces requireRole('admin')). */
export const adminMembersRouter = Router();
export const membershipInfoRouter = Router();

/** GET /api/membership/info — public: what a membership costs, what it includes and until when it runs. */
membershipInfoRouter.get('/info', (_req, res) => res.json({ ...membershipOffer(), valid_until: academicYearEnd() }));

membershipsRouter.post('/', requireAuth, validate({ body: startDuesSchema }), asyncHandler(async (req, res) => {
  // Dues are set by the club; a client-sent `amount` is ignored (it used to let a member pay ₹1 for a membership).
  res.status(201).json(await svc.startDues(req.user!.id, req.body));
}));

adminMembersRouter.get('/', validate({ query: listMembersQuery }), asyncHandler(async (req, res) => {
  res.json(await svc.listMembers(req.query as any));
}));
adminMembersRouter.get('/:id/verify', validate({ params: z.object({ id: z.string() }), query: verifyQuery }), asyncHandler(async (req, res) => {
  res.json(await svc.verifyMember(req.params.id, (req.query as any).qr_token));
}));
adminMembersRouter.post('/:id/cash-payment', validate({ params: idParam, body: cashDuesSchema }), asyncHandler(async (req, res) => {
  res.status(201).json(await svc.recordCashDues(req.user!.id, Number(req.params.id), req.body.amount, req.body.expiry_date));
}));
