import { getToken, clearToken } from '@/auth/token';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

/** Typed fetch wrapper. Calls `/api` relative — same origin in production (§15). */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as any) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = init.body;
  if (init.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(init.json); }
  const res = await fetch(`/api${path}`, { ...init, headers, body });
  // A rejected token means the session is over: drop it and tell AuthProvider so cached user state resets.
  if (res.status === 401 && token) { clearToken(); window.dispatchEvent(new Event('ssa:unauthorized')); }
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  // statusText is empty over HTTP/2 and proxy errors are HTML, so fall back to a readable message.
  if (!res.ok) throw new ApiError(res.status, (data as any)?.error || res.statusText || `Request failed (${res.status})`, (data as any)?.details);
  return data as T;
}
export const get = <T,>(p: string) => api<T>(p);
export const post = <T,>(p: string, json?: unknown) => api<T>(p, { method: 'POST', json });
export const patch = <T,>(p: string, json?: unknown) => api<T>(p, { method: 'PATCH', json });
