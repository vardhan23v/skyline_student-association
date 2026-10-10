import { useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@/api/types';
import { useAuth } from './AuthContext';
import { loginUrl } from './redirect';
import { Skeleton } from '@/components/EmptyState';
import { useToast } from '@/components/Toast';

/**
 * Route guard (UX only: the API enforces every permission itself).
 * Signed out → /login?next=<here>. Signed in without the role → /me with an "Admins only" toast.
 */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { me, loading, has } = useAuth();
  const loc = useLocation();
  const toast = useToast();
  const denied = !!me && !has(...roles);
  const told = useRef(false);
  useEffect(() => { if (denied && !told.current) { told.current = true; toast.error(roles.includes('admin') ? 'Admins only' : 'Not available for your account'); } }, [denied, roles, toast]);
  if (loading) return <div className="card"><Skeleton rows={5} /></div>;
  if (!me) return <Navigate to={loginUrl(loc.pathname + loc.search)} replace />;
  if (denied) return <Navigate to="/me" replace />;
  return <Outlet />;
}
