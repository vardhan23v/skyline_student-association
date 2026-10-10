import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import * as svc from './service';
import { cashDuesSchema, idParam, listMembersQuery, membershipOffer, setExpirySchema, startDuesSchema, verifyQuery, walkInSchema } from './schemas';
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
adminMembersRouter.post('/walk-in', validate({ body: walkInSchema }), asyncHandler(async (req, res) => {
  res.status(201).json(await svc.walkIn(req.user!.id, req.body, req.ip));
}));
adminMembersRouter.get('/:id/verify', validate({ params: z.object({ id: z.string() }), query: verifyQuery }), asyncHandler(async (req, res) => {
  res.json(await svc.verifyMember(req.params.id, (req.query as any).qr_token));
}));
adminMembersRouter.get('/:id/dues', validate({ params: idParam }), asyncHandler(async (req, res) => {
  res.json(await svc.duesHistory(Number(req.params.id)));
}));
adminMembersRouter.patch('/:id/membership', validate({ params: idParam, body: setExpirySchema }), asyncHandler(async (req, res) => {
  res.json(await svc.setExpiry(Number(req.params.id), req.body.expiry_date));
}));
adminMembersRouter.post('/:id/remind', validate({ params: idParam }), asyncHandler(async (req, res) => {
  res.json(await svc.sendReminder(Number(req.params.id)));
}));
adminMembersRouter.post('/:id/cash-payment', validate({ params: idParam, body: cashDuesSchema }), asyncHandler(async (req, res) => {
  res.status(201).json(await svc.recordCashDues(req.user!.id, Number(req.params.id), req.body.amount, req.body.expiry_date));
}));
