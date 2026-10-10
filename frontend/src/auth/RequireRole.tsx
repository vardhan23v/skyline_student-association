import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@/api/types';
import { useAuth } from './AuthContext';

export function RequireRole({ roles }: { roles: Role[] }) {
  const { me, loading, has } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!me) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!has(...roles)) return <div className="p-8 card text-rose-700">You need the {roles.join(' or ')} role to view this page.</div>;
  return <Outlet />;
}
