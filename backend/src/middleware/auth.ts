import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';

export type Role = 'member' | 'volunteer' | 'admin' | 'treasurer';
export type AuthUser = { id: number; role: Role; email: string };

declare global {
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

export const signToken = (u: AuthUser) =>
  jwt.sign({ sub: String(u.id), role: u.role, email: u.email }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '24h' });

export function parseAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) {
    try {
      const p = jwt.verify(h.slice(7), env.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      const id = Number(p.sub);
      // Only accept tokens we minted for a user: a numeric subject and a known role (otherwise hasRole() would throw → 500).
      if (!Number.isInteger(id) || id <= 0 || typeof p.role !== 'string' || !Object.prototype.hasOwnProperty.call(grants, p.role)) throw new Error('bad claims');
      req.user = { id, role: p.role as Role, email: p.email };
    } catch {
      return next(unauthorized('Invalid or expired token'));
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

/**
 * Role check. `admin` ⊇ `volunteer` ⊇ `member`. `treasurer` ⊇ `member` and holds finance rights
 * that admins do NOT have (separation of duties, §7).
 */
const grants: Record<Role, Role[]> = {
  member: ['member'],
  volunteer: ['volunteer', 'member'],
  admin: ['admin', 'volunteer', 'member'],
  treasurer: ['treasurer', 'member'],
};

export const hasRole = (user: AuthUser | undefined, ...roles: Role[]) =>
  !!user && roles.some((r) => grants[user.role].includes(r));

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized());
  if (!hasRole(req.user, ...roles)) return next(forbidden(`Requires role: ${roles.join(' or ')}`));
  next();
};
