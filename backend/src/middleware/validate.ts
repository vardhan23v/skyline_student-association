import type { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { badRequest } from '../lib/errors';
import { WEAK_PASSWORD_ISSUE, weakPassword } from '../lib/password';

type Part = 'body' | 'params' | 'query';
export const validate = (schemas: Partial<Record<Part, ZodSchema>>) =>
  (req: Request, _res: Response, next: NextFunction) => {
    for (const part of ['params', 'query', 'body'] as Part[]) {
      const s = schemas[part];
      if (!s) continue;
      const r = s.safeParse(req[part]);
      if (!r.success) {
        // Only the password failed the rules: 400 WEAK_PASSWORD with the reasons, so the form can list them.
        const weak = r.error.issues.filter((i) => (i as any).params?.[WEAK_PASSWORD_ISSUE]);
        if (weak.length && weak.length === r.error.issues.length) return next(weakPassword(weak.map((i) => i.message)));
        return next(badRequest(`Invalid ${part}`, r.error.flatten()));
      }
      (req as any)[part] = r.data;
    }
    next();
  };
