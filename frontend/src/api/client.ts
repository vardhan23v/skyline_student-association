import { getToken, clearToken } from '@/auth/token';
import type { MembershipOffer } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown, public code?: string, public body?: any) { super(message); }
}

/** 403 MEMBERSHIP_REQUIRED from a members-only endpoint. useAuthAction catches it and opens the membership card. */
export class MembershipRequiredError extends ApiError {
  constructor(message: string, public membership: MembershipOffer, body: any) { super(403, message, undefined, 'MEMBERSHIP_REQUIRED', body); }
}
export const isMembershipRequired = (e: unknown): e is MembershipRequiredError => e instanceof MembershipRequiredError;

/** Typed fetch wrapper. Calls `/api` relative — same origin in production. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as any) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = init.body;
  if (init.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(init.json); }
  const res = await fetch(`/api${path}`, { ...init, headers, body });
  // A rejected token means the session is over: drop it and tell AuthProvider, which sends the user to /login?next=….
  // Without a token a 401 is just "wrong password" on the login form, so leave that to the caller.
  if (res.status === 401 && token) { clearToken(); window.dispatchEvent(new Event('ssa:unauthorized')); }
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const d = data as any;
    // statusText is empty over HTTP/2 and proxy errors are HTML, so fall back to a readable message.
    const message = d?.message || d?.error || res.statusText || `Request failed (${res.status})`;
    if (res.status === 403 && d?.code === 'MEMBERSHIP_REQUIRED') throw new MembershipRequiredError(message, d.membership, d);
    throw new ApiError(res.status, message, d?.details, d?.code, d);
  }
  return data as T;
}
export const get = <T,>(p: string) => api<T>(p);
export const post = <T,>(p: string, json?: unknown) => api<T>(p, { method: 'POST', json });
export const patch = <T,>(p: string, json?: unknown) => api<T>(p, { method: 'PATCH', json });
export const del = <T,>(p: string) => api<T>(p, { method: 'DELETE' });
