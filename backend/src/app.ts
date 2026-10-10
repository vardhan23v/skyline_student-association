import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import path from 'node:path';
import fs from 'node:fs';
import { parseAuth, queryTokenAuth, requireAuth } from './middleware/auth';
import { errorHandler, asyncHandler } from './middleware/errorHandler';
import { logger } from './lib/logger';
import { unauthorized } from './lib/errors';
import { env, isProd, isTest } from './config/env';
import { canonicalHost } from './middleware/canonicalHost';
import { getDb } from './config/db';
import { authRouter } from './modules/auth/routes';
import { membershipInfoRouter, membershipsRouter } from './modules/memberships/routes';
import { eventsRouter, ticketsRouter } from './modules/events/routes';
import { announcementsRouter } from './modules/announcements/routes';
import { ordersRouter, productsRouter } from './modules/merchandise/routes';
import { fundraisersRouter } from './modules/fundraisers/routes';
import { expensesRouter, financeRouter } from './modules/finance/routes';
import { webhookRouter } from './modules/payments/webhook';
import { paymentsRouter } from './modules/payments/routes';
import { adminRouter } from './modules/admin/routes';
import { aiRouter } from './modules/ai/routes';
import { myMembership } from './modules/memberships/service';
import { myTickets } from './modules/events/service';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  // COOP `same-origin` (helmet's default) severs window.opener for Razorpay Checkout's bank/UPI popups, so the payment
  // window cannot report back to the page; allow-popups keeps the isolation for everything else.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' } }));
  // The SSE stream carries its JWT as ?token= (EventSource can't set headers): never write query strings to the log.
  if (!isTest) app.use(pinoHttp({ logger, serializers: { req: (r) => ({ id: r.id, method: r.method, url: String(r.url).split('?')[0] }) } }));
  // Production: one public hostname (APP_URL). Old ones get a 301 to the same path; health and webhooks still answer.
  if (isProd) app.use(canonicalHost(env.APP_URL));
  app.get('/health', (_req, res) => res.type('text').send('ok'));

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
  api.use('/membership', membershipInfoRouter);
  // Seat/stock holds and checkouts: cap them per IP so a script can't hold every seat or every T-shirt.
  const purchaseLimit = rateLimit({ windowMs: 15 * 60_000, limit: isTest ? 10_000 : 30, standardHeaders: 'draft-7', legacyHeaders: false });
  api.post('/events/:id/register', purchaseLimit);
  api.post('/orders', purchaseLimit);
  api.post('/memberships', purchaseLimit);
  api.use('/memberships', membershipsRouter);
  api.use('/payments', paymentsRouter);
  api.use('/events', eventsRouter);
  api.use('/tickets', ticketsRouter);
  api.use('/announcements', announcementsRouter);
  api.use('/products', productsRouter);
  api.use('/orders', ordersRouter);
  api.use('/fundraisers', fundraisersRouter);
  api.use('/expenses', expensesRouter);
  api.use('/finance', financeRouter);
  api.use('/ai', aiRouter);
  api.use('/admin/checkin', rateLimit({ windowMs: 60_000, limit: isTest ? 10_000 : 120 }));
  api.use('/admin/orders/stream', queryTokenAuth);
  api.use('/admin', adminRouter);
  api.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use('/api', api);

  // Serve the built SPA from the same origin (§15) — no CORS needed.
  const dist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(dist)) {
    // Vite's hashed bundles never change under the same name: cache them for a year. index.html (and the other
    // un-hashed files) revalidate, so a deploy shows up on the next load.
    app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
    app.use(express.static(dist, { setHeaders: (res, file) => { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
    // SPA fallback for page routes only: a missing file (/media/x.mp4) is a 404, not index.html served as a video.
    app.get('*', (req, res) => (path.extname(req.path) ? res.status(404).type('text').send('Not found') : res.sendFile(path.join(dist, 'index.html'))));
  }
  app.use(errorHandler);
  return app;
}
