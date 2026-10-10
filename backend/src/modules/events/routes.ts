import { Router } from 'express';
import { hasRole, requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import * as svc from './service';
import { buyBody, cashTicketBody, checkinBody, eventBody, idParam } from './schemas';

export const eventsRouter = Router();
export const ticketsRouter = Router();
export const checkinRouter = Router();

eventsRouter.get('/', asyncHandler(async (req, res) => res.json(await svc.listEvents(req.user, hasRole(req.user, 'admin')))));
eventsRouter.post('/', requireRole('admin'), validate({ body: eventBody }), asyncHandler(async (req, res) => res.status(201).json(await svc.createEvent(req.body))));
eventsRouter.get('/:id', validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await svc.getEvent(Number(req.params.id), req.user, hasRole(req.user, 'admin')))));
eventsRouter.patch('/:id', requireRole('admin'), validate({ params: idParam, body: eventBody.partial() }), asyncHandler(async (req, res) => res.json(await svc.updateEvent(Number(req.params.id), req.body))));
eventsRouter.post('/:id/tickets', validate({ params: idParam, body: buyBody }), asyncHandler(async (req, res) => res.status(201).json(await svc.buyTicket(Number(req.params.id), req.user, req.body))));
// Cash door sale writes a cash payment + ledger row: finance write → treasurer only (§7 separation of duties, §8).
eventsRouter.post('/:id/cash-ticket', requireRole('treasurer'), validate({ params: idParam, body: cashTicketBody }), asyncHandler(async (req, res) => res.status(201).json(await svc.sellCashTicket(req.user!.id, Number(req.params.id), req.body))));
eventsRouter.get('/:id/report', requireRole('admin', 'treasurer'), validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await svc.eventReport(Number(req.params.id)))));

ticketsRouter.get('/', requireAuth, asyncHandler(async (req, res) => res.json(await svc.myTickets(req.user!.id))));
ticketsRouter.get('/:id', requireAuth, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await svc.getTicket(Number(req.params.id), req.user!))));

checkinRouter.post('/', requireRole('volunteer'), validate({ body: checkinBody }), asyncHandler(async (req, res) => {
  const r = await svc.checkIn(req.user!.id, req.body.qr_token, req.body.event_id);
  res.status(r.ok ? 200 : 409).json(r);
}));
