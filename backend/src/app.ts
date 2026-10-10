import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import path from 'node:path';
import fs from 'node:fs';
import { parseAuth, requireAuth } from './middleware/auth';
import { errorHandler, asyncHandler } from './middleware/errorHandler';
import { logger } from './lib/logger';
import { unauthorized } from './lib/errors';
import { isTest } from './config/env';
import { getDb } from './config/db';
import { authRouter } from './modules/auth/routes';
import { membersRouter, membershipsRouter } from './modules/memberships/routes';
import { checkinRouter, eventsRouter, ticketsRouter } from './modules/events/routes';
import { announcementsRouter } from './modules/announcements/routes';
import { ordersRouter, productsRouter, variantsRouter } from './modules/merchandise/routes';
import { fundraisersRouter, tasksRouter } from './modules/fundraisers/routes';
import { expensesRouter, financeRouter } from './modules/finance/routes';
import { webhookRouter } from './modules/payments/webhook';
import { aiRouter } from './modules/ai/routes';
import { myMembership } from './modules/memberships/service';
import { myTickets } from './modules/events/service';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  // COOP `same-origin` (helmet's default) severs window.opener for Razorpay Checkout's bank/UPI popups, so the payment
  // window cannot report back to the page; allow-popups keeps the isolation for everything else.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' } }));
  if (!isTest) app.use(pinoHttp({ logger }));

  const api = express.Router();
  // Webhook needs the raw body for HMAC — mounted before express.json().
  api.use('/webhooks', webhookRouter);
  api.use(express.json({ limit: '8mb' }));
  api.use(parseAuth);

  api.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
  api.use('/auth', authRouter);
  api.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const user = await getDb()('users').where({ id: req.user!.id }).first('id', 'name', 'email', 'role', 'is_active');
    // A token outlives a deleted or deactivated account; answering 200 with `user: undefined` crashed the SPA (me.user.role).
    if (!user || !user.is_active) throw unauthorized('Account not found or deactivated');
    delete user.is_active;
    res.json({ user, ...(await myMembership(req.user!.id)), tickets: await myTickets(req.user!.id) });
  }));
  api.use('/memberships', membershipsRouter);
  api.use('/members', membersRouter);
  // Seat/stock holds are public and email the buyer: cap them per IP so a script can't hold every seat or spam inboxes.
  const purchaseLimit = rateLimit({ windowMs: 15 * 60_000, limit: isTest ? 10_000 : 30, standardHeaders: 'draft-7', legacyHeaders: false });
  api.post('/events/:id/tickets', purchaseLimit);
  api.post('/orders', purchaseLimit);
  api.use('/events', eventsRouter);
  api.use('/tickets', ticketsRouter);
  api.use('/checkin', rateLimit({ windowMs: 60_000, limit: isTest ? 10_000 : 120 }), checkinRouter);
  api.use('/announcements', announcementsRouter);
  api.use('/products', productsRouter);
  api.use('/variants', variantsRouter);
  api.use('/orders', ordersRouter);
  api.use('/fundraisers', fundraisersRouter);
  api.use('/tasks', tasksRouter);
  api.use('/expenses', expensesRouter);
  api.use('/finance', financeRouter);
  api.use('/ai', aiRouter);
  api.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use('/api', api);

  // Serve the built SPA from the same origin (§15) — no CORS needed.
  const dist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
