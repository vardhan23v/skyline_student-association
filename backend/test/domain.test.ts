import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { canonicalHost } from '../src/middleware/canonicalHost';
import { appUrl, env } from '../src/config/env';
import { siteLink } from '../src/lib/email';

/** The production app behind `canonicalHost`: what Railway serves on the old and the new hostname. */
function prodApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(canonicalHost('https://skyline-student-association.up.railway.app'));
  app.get('/health', (_req, res) => res.send('ok'));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.post('/api/webhooks/payment', (_req, res) => res.json({ received: true }));
  app.get('*', (_req, res) => res.send('page'));
  return app;
}

describe('domain switch (APP_URL)', () => {
  it('301s the old hostname to the same path and query on APP_URL', async () => {
    const r = await request(prodApp()).get('/events/12?action=register').set('Host', 'web-production-2ba70.up.railway.app');
    expect(r.status).toBe(301);
    expect(r.headers.location).toBe('https://skyline-student-association.up.railway.app/events/12?action=register');
  });

  it('serves the APP_URL hostname normally', async () => {
    const r = await request(prodApp()).get('/events').set('Host', 'skyline-student-association.up.railway.app');
    expect(r.status).toBe(200);
  });

  it('keeps health checks and payment webhooks working on the old hostname', async () => {
    const app = prodApp();
    expect((await request(app).get('/health').set('Host', 'web-production-2ba70.up.railway.app')).status).toBe(200);
    expect((await request(app).get('/api/health').set('Host', 'web-production-2ba70.up.railway.app')).status).toBe(200);
    expect((await request(app).post('/api/webhooks/payment').set('Host', 'web-production-2ba70.up.railway.app')).status).toBe(200);
  });

  it('builds email links from APP_URL', () => {
    expect(appUrl('/tickets/7')).toBe(`${env.APP_URL}/tickets/7`);
    expect(siteLink('/me', 'Renew')).toContain(`href="${env.APP_URL}/me"`);
  });
});
