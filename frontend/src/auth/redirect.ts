import type { Me } from '@/api/types';

/**
 * `?next=` is only ever a path on this site: it must start with `/`, not `//` (protocol-relative) or `/\`
 * (browsers treat it the same), and contain no scheme. Anything else is dropped, so a crafted login link can't
 * bounce the user to another origin after they sign in.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw.slice(1)) || /[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return null;
  if (/[\u0000-\u001f]/.test(raw)) return null;
  return raw;
}

/** Where someone lands after login (or when they open /login while already signed in). */
export function destinationFor(me: Me, next: string | null, action?: string | null): string {
  if (me.user.role === 'admin') return next?.startsWith('/admin') ? next : '/admin';
  if (!next) return '/me';
  return action ? withParam(next, 'action', action) : next;
}

export function withParam(path: string, key: string, value: string) {
  const [p, hash = ''] = path.split('#');
  const [base, qs = ''] = p.split('?');
  const params = new URLSearchParams(qs); params.set(key, value);
  return `${base}?${params}${hash ? `#${hash}` : ''}`;
}

/** `/login?next=…` for the current page (or `path`), optionally with a resume action. */
export function loginUrl(path: string, action?: string, extra?: Record<string, string>) {
  const p = new URLSearchParams({ next: path, ...(action ? { action } : {}), ...extra });
  return `/login?${p}`;
}
