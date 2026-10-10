import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/api/client';
import type { Me, Role } from '@/api/types';
import { clearToken, getToken, setToken } from './token';

type Ctx = { me: Me | null; loading: boolean; login: (email: string, password: string) => Promise<void>; register: (d: any) => Promise<void>; logout: () => void; has: (...roles: Role[]) => boolean };
const AuthCtx = createContext<Ctx>(null!);

/** Mirrors the API's role grants (§7) for UX only — every endpoint re-checks. */
const grants: Record<Role, Role[]> = { member: ['member'], volunteer: ['volunteer', 'member'], admin: ['admin', 'volunteer', 'member'], treasurer: ['treasurer', 'member'] };

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const onUnauthorized = () => { qc.clear(); rerender(); };
    window.addEventListener('ssa:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ssa:unauthorized', onUnauthorized);
  }, [qc]);
  const q = useQuery({ queryKey: ['me'], queryFn: () => get<Me>('/me'), enabled: !!getToken(), retry: false });
  const me = getToken() && q.data ? q.data : null;
  const finish = async (r: { token: string }) => { setToken(r.token); await qc.invalidateQueries(); };
  const value: Ctx = {
    me, loading: !!getToken() && q.isLoading,
    login: async (email, password) => finish(await post('/auth/login', { email, password })),
    register: async (d) => finish(await post('/auth/register', d)),
    logout: () => { clearToken(); qc.clear(); rerender(); },
    has: (...roles) => !!me && roles.some((r) => grants[me.user.role].includes(r)),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
