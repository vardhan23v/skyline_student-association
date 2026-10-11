import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import * as svc from './service';
import { checkinBody, eventBody, idParam } from './schemas';

export const eventsRouter = Router();
export const ticketsRouter = Router();
/** Mounted at /api/admin/events and /api/admin/checkin (the admin router enforces requireRole('admin')). */
export const adminEventsRouter = Router();
export const adminCheckinRouter = Router();

eventsRouter.get('/', asyncHandler(async (req, res) => res.json(await svc.listEvents(req.user))));
eventsRouter.get('/:id', validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await svc.getEvent(Number(req.params.id), req.user))));
// Any signed-in user: members pay member_price, others non_member_price (members_only events still need membership).
eventsRouter.post('/:id/register', requireAuth, validate({ params: idParam }), asyncHandler(async (req, res) => {
  const r = await svc.registerForEvent(Number(req.params.id), req.user!.id);
  res.status(r.resumed ? 200 : 201).json(r);
}));
eventsRouter.delete('/:id/register', requireAuth, validate({ params: idParam }), asyncHandler(async (req, res) => {
  res.json(await svc.cancelRegistration(Number(req.params.id), req.user!.id));
}));

ticketsRouter.get('/', requireAuth, asyncHandler(async (req, res) => res.json(await svc.myTickets(req.user!.id))));
ticketsRouter.get('/:id/calendar.ics', requireAuth, validate({ params: idParam }), asyncHandler(async (req, res) => {
  const ics = await svc.ticketCalendar(Number(req.params.id), req.user!.id);
  res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="ssa-ticket-${req.params.id}.ics"`, 'Cache-Control': 'private, no-store' });
  res.send(ics);
}));
ticketsRouter.get('/:id', requireAuth, validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await svc.getTicket(Number(req.params.id), req.user!))));

adminEventsRouter.get('/', asyncHandler(async (req, res) => res.json(await svc.listEvents(req.user, true))));
adminEventsRouter.post('/', validate({ body: eventBody }), asyncHandler(async (req, res) => res.status(201).json(await svc.createEvent(req.body))));
adminEventsRouter.get('/:id', validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await svc.getEvent(Number(req.params.id), req.user, true))));
adminEventsRouter.patch('/:id', validate({ params: idParam, body: eventBody.partial() }), asyncHandler(async (req, res) => res.json(await svc.updateEvent(Number(req.params.id), req.body))));
adminEventsRouter.get('/:id/report', validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await svc.eventReport(Number(req.params.id)))));
adminEventsRouter.get('/:id/registrations', validate({ params: idParam }), asyncHandler(async (req, res) => res.json(await svc.eventRegistrations(Number(req.params.id)))));

adminCheckinRouter.post('/', validate({ body: checkinBody }), asyncHandler(async (req, res) => {
  const r = await svc.checkIn(req.user!.id, req.body.qr_token, req.body.event_id);
  res.status(r.ok ? 200 : 409).json(r);
}));
