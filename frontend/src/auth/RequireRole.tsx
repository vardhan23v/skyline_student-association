import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import type { Role } from '@/api/types';
import { useAuth } from './AuthContext';
import { Skeleton, EmptyState } from '@/components/EmptyState';

export function RequireRole({ roles }: { roles: Role[] }) {
  const { me, loading, has } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="card"><Skeleton rows={5} /></div>;
  if (!me) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  if (!has(...roles)) return <EmptyState icon={<ShieldAlert className="size-5 text-danger" aria-hidden />} title="Not available for your role" description={`This area needs the ${roles.join(' or ')} role. You are signed in as ${me.user.role}.`} action={<Link to="/dashboard" className="btn-secondary">Back to dashboard</Link>} />;
  return <Outlet />;
}
