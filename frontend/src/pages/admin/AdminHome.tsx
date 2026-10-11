import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { HandCoins, Scale, ShoppingBag, Sparkles, Ticket, Users, Wallet } from 'lucide-react';
import { get } from '@/api/client';
import type { AdminOverview } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { ADMIN_SECTIONS, legacyAdminPath } from '@/components/AdminTabs';
import { PageHeader } from '@/components/PageHeader';
import { MetricCard } from '@/components/MetricCard';
import { ErrorState } from '@/components/EmptyState';
import { SecretaryDrawer } from '@/components/SecretaryDrawer';
import { Button } from '@/components/Button';
import { money } from '@/components/format';

/** /admin: the Control Room overview. Old `/admin?tab=…` links land here and are sent on to the section's own path. */
export function AdminHome() {
  const { search } = useLocation();
  const legacy = legacyAdminPath(search);
  if (legacy) return <Navigate to={legacy} replace />;
  return <AdminOverviewPage />;
}

function AdminOverviewPage() {
  const [ai, setAi] = useState(false);
  return <><Overview onOpenSecretary={() => setAi(true)} /><SecretaryDrawer open={ai} onClose={() => setAi(false)} /></>;
}

function Overview({ onOpenSecretary }: { onOpenSecretary: () => void }) {
  const { me } = useAuth();
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => get<AdminOverview>('/admin/overview'), refetchInterval: 30_000 });
  const o = q.data;
  return (
    <>
      <PageHeader eyebrow={`Hello, ${me?.user.name.split(' ')[0] ?? 'admin'}`} script="control" title="Room" description={o ? `Club at a glance, ${o.as_of}.` : 'Club at a glance.'}
        actions={<Button variant="secondary" onClick={onOpenSecretary} icon={<Sparkles className="size-4 text-accent-text" aria-hidden />}>AI Secretary</Button>} />
      <ErrorState error={q.error} onRetry={() => q.refetch()} className="mb-4" />
      {/* 2 columns on phones and tablets, 3 from lg: six tiles in even rows. */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3">
        <MetricCard label="Active members" icon={Users} loading={q.isLoading} value={o?.members.active ?? '—'} hint={o ? `${o.members.total} member profiles` : undefined} />
        <MetricCard label="Upcoming registrations" icon={Ticket} loading={q.isLoading} value={o?.upcoming_registrations ?? '—'} hint="confirmed seats at future events" />
        <MetricCard label="Orders today" icon={ShoppingBag} loading={q.isLoading} value={o?.orders_today.count ?? '—'} hint={o ? `${money(o.orders_today.revenue)} paid · ${o.pending_orders} pending overall` : undefined} tone={o?.pending_orders ? 'warning' : 'default'} />
        <MetricCard label="Balance" icon={Wallet} loading={q.isLoading} value={o ? money(o.balance) : '—'} tone="accent" />
        <Link to="/admin/finance?view=dues" className="interactive rounded-[var(--radius-lg)] focus-ring">
          <MetricCard label="Owed to club" icon={Scale} loading={q.isLoading} value={o ? money(o.dues.owed_to_club) : '—'} className="card-hover h-full"
            hint={o ? <>owed by club <span className={o.dues.owed_by_club ? 'text-danger' : ''}>{money(o.dues.owed_by_club)}</span></> : undefined} />
        </Link>
        <Link to="/admin/fundraisers" className="interactive rounded-[var(--radius-lg)] focus-ring">
          <MetricCard label="Active fundraisers" icon={HandCoins} loading={q.isLoading} value={o?.fundraisers.active ?? '—'} className="card-hover h-full"
            hint={o ? (o.fundraisers.behind ? <span className="text-danger">{o.fundraisers.behind} behind</span> : 'all on track') : undefined} />
        </Link>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ADMIN_SECTIONS.filter((t) => t.key !== 'overview').map((t) => (
          <Link key={t.key} to={t.to} className="card card-hover interactive group flex min-h-16 items-center gap-3 !py-3 focus-ring">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent-text"><t.icon className="size-4" aria-hidden /></span>
            <span className="min-w-0 truncate font-medium">{t.label}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
