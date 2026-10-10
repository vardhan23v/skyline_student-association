export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (m: string, d?: unknown) => new HttpError(400, m, 'BAD_REQUEST', d);
export const unauthorized = (m = 'Unauthorized') => new HttpError(401, m, 'UNAUTHORIZED');
export const forbidden = (m = 'Forbidden') => new HttpError(403, m, 'FORBIDDEN');
export const notFound = (m = 'Not found') => new HttpError(404, m, 'NOT_FOUND');
export const conflict = (m: string) => new HttpError(409, m, 'CONFLICT');
