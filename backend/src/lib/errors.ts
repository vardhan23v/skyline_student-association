export class HttpError extends Error {
  /** `extra` is merged into the JSON body (e.g. the membership offer on MEMBERSHIP_REQUIRED). */
  constructor(public status: number, message: string, public code?: string, public details?: unknown, public extra?: Record<string, unknown>) {
    super(message);
  }
}
export const badRequest = (m: string, d?: unknown) => new HttpError(400, m, 'BAD_REQUEST', d);
export const unauthorized = (m = 'Unauthorized') => new HttpError(401, m, 'UNAUTHORIZED');
export const forbidden = (m = 'Forbidden') => new HttpError(403, m, 'FORBIDDEN');
export const notFound = (m = 'Not found') => new HttpError(404, m, 'NOT_FOUND');
/** 409 with a specific code when the client must tell cases apart (ALREADY_REGISTERED vs SOLD_OUT). */
export const conflict = (m: string, code = 'CONFLICT', extra?: Record<string, unknown>) => new HttpError(409, m, code, undefined, extra);
