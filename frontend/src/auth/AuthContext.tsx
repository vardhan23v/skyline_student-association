import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { get, post } from '@/api/client';
import type { Me, Role } from '@/api/types';
import { clearToken, getToken, setToken } from './token';
import { loginUrl } from './redirect';

type Ctx = {
  me: Me | null; loading: boolean;
  login: (email: string, password: string) => Promise<Me>; register: (d: any) => Promise<Me>; logout: () => void;
  refreshMe: () => Promise<Me | null>; has: (...roles: Role[]) => boolean;
};
const AuthCtx = createContext<Ctx>(null!);

/** Mirrors the API's role grants for UX only — every endpoint re-checks. `admin` ⊇ `user`. */
const grants: Record<Role, Role[]> = { user: ['user'], admin: ['admin', 'user'] };

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // client.ts fires this when the API rejects our token: the session is over. Drop everything cached for this
  // user and send them to log in again, back to where they were.
  useEffect(() => {
    const onUnauthorized = () => {
      qc.clear(); rerender();
      const here = window.location.pathname + window.location.search;
      if (!window.location.pathname.startsWith('/login')) nav(loginUrl(here, undefined, { expired: '1' }), { replace: true });
    };
    window.addEventListener('ssa:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ssa:unauthorized', onUnauthorized);
  }, [qc, nav]);
  const q = useQuery({ queryKey: ['me'], queryFn: () => get<Me>('/me'), enabled: !!getToken(), retry: false });
  const me = getToken() && q.data ? q.data : null;
  // The ['me'] query is disabled while signed out, so invalidateQueries() never refetches it and nothing re-renders
  // this provider: load /me explicitly, then re-render so guards see the user before the caller navigates.
  // Anything cached while signed out (public-only posts, viewer blocks) belongs to the wrong viewer, so drop it.
  const finish = async (r: { token: string }) => {
    setToken(r.token);
    qc.removeQueries();
    try { return await qc.fetchQuery({ queryKey: ['me'], queryFn: () => get<Me>('/me') }); } finally { rerender(); }
  };
  const value: Ctx = {
    me, loading: !!getToken() && q.isLoading,
    login: async (email, password) => finish(await post('/auth/login', { email, password })),
    register: async (d) => finish(await post('/auth/register', d)),
    logout: () => { clearToken(); qc.clear(); rerender(); nav('/', { replace: true }); },
    refreshMe: async () => (getToken() ? (await q.refetch()).data ?? null : null),
    has: (...roles) => !!me && roles.some((r) => grants[me.user.role]?.includes(r)),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
