import type { RequestHandler } from 'express';

/** Paths that answer on any hostname: health checks, and payment webhooks still addressed to the old domain. */
const PASS = [/^\/health$/, /^\/api\/health$/, /^\/api\/webhooks\//];

/**
 * After a domain change, send every other request on an old hostname (e.g. the previous *.up.railway.app name) to
 * the same path on `appUrl` with a 301. `trust proxy` is on, so `req.hostname` is the host the visitor used.
 */
export function canonicalHost(appUrl: string): RequestHandler {
  const target = new URL(appUrl);
  return (req, res, next) => {
    if (req.hostname === target.hostname || PASS.some((p) => p.test(req.path))) return next();
    res.redirect(301, `${target.origin}${req.originalUrl}`);
  };
}
