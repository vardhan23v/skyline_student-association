import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { getDb } from '../config/db';
import { HttpError, forbidden, unauthorized } from '../lib/errors';
import { isActiveMember } from '../modules/memberships/service';
import { membershipOffer } from '../modules/memberships/schemas';

/** Two roles. Membership is a status (an active `memberships` row), never a role: see requireMember. */
export type Role = 'admin' | 'user';
export type AuthUser = { id: number; role: Role; email: string };

declare global {
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

/** `admin` ⊇ `user`. */
const grants: Record<Role, Role[]> = {
  user: ['user'],
  admin: ['admin', 'user'],
};

export const signToken = (u: AuthUser) =>
  jwt.sign({ sub: String(u.id), role: u.role, email: u.email }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '24h' });

/**
 * Verify one of our access tokens. Only accept tokens we minted for a user: a numeric subject and a current role.
 * Tokens issued before the two-role migration (role `member`, `treasurer`…) fail here, so those users sign in again.
 */
export function verifyToken(token: string): AuthUser {
  const p = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
  const id = Number(p.sub);
  if (!Number.isInteger(id) || id <= 0 || typeof p.role !== 'string' || !Object.prototype.hasOwnProperty.call(grants, p.role)) throw new Error('bad claims');
  return { id, role: p.role as Role, email: p.email };
}

export function parseAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) {
    try { req.user = verifyToken(h.slice(7)); } catch { return next(unauthorized('Invalid or expired token')); }
  }
  next();
}

/**
 * EventSource cannot send an Authorization header, so the SSE stream takes the same JWT as `?token=` and verifies it
 * exactly like a Bearer token. Mount only on stream routes. The request logger redacts the query string.
 */
export function queryTokenAuth(req: Request, _res: Response, next: NextFunction) {
  const t = req.query.token;
  if (!req.user && typeof t === 'string' && t) {
    try { req.user = verifyToken(t); } catch { return next(unauthorized('Invalid or expired token')); }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

export const hasRole = (user: AuthUser | undefined, ...roles: Role[]) =>
  !!user && roles.some((r) => grants[user.role].includes(r));

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized());
  if (!hasRole(req.user, ...roles)) return next(forbidden(`Requires role: ${roles.join(' or ')}`));
  next();
};

/** 403 body the client turns into the membership card: what it costs and what it gets you. */
export const membershipRequired = () =>
  new HttpError(403, 'An active membership is required', 'MEMBERSHIP_REQUIRED', undefined, { membership: membershipOffer() });

/** requireAuth + an active membership (status 'active' and expiry_date >= today in the club's time zone). */
export function requireMember(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  isActiveMember(getDb(), req.user.id)
    .then((ok) => next(ok ? undefined : membershipRequired()))
    .catch(next);
}
