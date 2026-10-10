import type { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { badRequest } from '../lib/errors';

type Part = 'body' | 'params' | 'query';
export const validate = (schemas: Partial<Record<Part, ZodSchema>>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    for (const part of ['params', 'query', 'body'] as Part[]) {
      const s = schemas[part];
      if (!s) continue;
      const r = s.safeParse(req[part]);
      if (!r.success) return next(badRequest(`Invalid ${part}`, r.error.flatten()));
      (req as any)[part] = r.data;
    }
    next();
  };
