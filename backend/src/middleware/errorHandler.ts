import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../lib/errors';
import { logger } from '../lib/logger';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
  }
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL' });
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
