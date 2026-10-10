import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../lib/errors';
import { logger } from '../lib/logger';

const UNIQUE_VIOLATIONS = new Set(['ER_DUP_ENTRY', 'SQLITE_CONSTRAINT_UNIQUE']);

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) {
    // `error` is the original field; `message` is the same text under the name the Phase 1 contract uses.
    return res.status(err.status).json({ error: err.message, message: err.message, code: err.code, details: err.details, ...err.extra });
  }
  const e = err as { status?: unknown; statusCode?: unknown; expose?: boolean; message?: string; code?: string } | null;
  // body-parser / http-errors: malformed JSON (400), body too large (413)… are client errors, not 500s.
  const status = Number(e?.status ?? e?.statusCode);
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: e?.expose && e.message ? e.message : 'Bad request', code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST' });
  }
  // A unique key lost a race (e.g. two sign-ups with the same email) → conflict, not a server error.
  if (e?.code && UNIQUE_VIOLATIONS.has(e.code)) {
    return res.status(409).json({ error: 'Already exists', code: 'CONFLICT' });
  }
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL' });
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
