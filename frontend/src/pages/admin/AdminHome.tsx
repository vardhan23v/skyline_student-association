import { Suspense, lazy, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, HandCoins, LayoutDashboard, Scale, Megaphone, QrCode, Shirt, ShoppingBag, Sparkles, Ticket, Users, Wallet } from 'lucide-react';
import { get } from '@/api/client';
import type { AdminOverview } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { AdminTabs, useAdminTab, type AdminTab } from '@/components/AdminTabs';
import { PageHeader } from '@/components/PageHeader';
import { MetricCard } from '@/components/MetricCard';
import { ErrorState, Skeleton } from '@/components/EmptyState';
import { SecretaryDrawer } from '@/components/SecretaryDrawer';
import { Button } from '@/components/Button';
import { money } from '@/components/format';
import { AdminEventsPage } from './AdminEventsPage';
import { AdminMembersPage } from './AdminMembersPage';
import { AdminOrdersPanel, AdminProductsPage } from './AdminProductsPage';
import { AdminAnnouncementsPage } from './AdminAnnouncementsPage';
import { AdminFundraisersPage } from './AdminFundraisersPage';
import { VerifyMemberPage } from './VerifyMemberPage';

// Camera and chart libraries are heavy; only load them when their tab opens (see vite.config manualChunks).
const ScannerPage = lazy(() => import('./ScannerPage').then((m) => ({ default: m.ScannerPage })));
const FinanceOverview = lazy(() => import('./FinanceOverview').then((m) => ({ default: m.FinanceOverview })));

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'events', label: 'Events', icon: CalendarDays },
  { key: 'fundraisers', label: 'Fundraisers', icon: HandCoins },
  { key: 'checkin', label: 'Check-in', icon: QrCode },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'orders', label: 'Orders', icon: ShoppingBag },
  { key: 'products', label: 'Products', icon: Shirt },
  { key: 'announcements', label: 'Announcements', icon: Megaphone },
  { key: 'finance', label: 'Finance', icon: Wallet },
] as const satisfies readonly AdminTab<string>[];
type TabKey = (typeof TABS)[number]['key'];

/** /admin: the admin dashboard. One page; the active tab lives in `?tab=`. */
export function AdminHome() {
  const tab = useAdminTab<TabKey>(TABS);
  const [ai, setAi] = useState(false);
  return (
    <>
      <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <AdminTabs tabs={TABS} panelId="admin-panel" />
      <div id="admin-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-w-0">
        {tab === 'overview' && <Overview onOpenSecretary={() => setAi(true)} />}
        {tab === 'events' && <AdminEventsPage />}
        {tab === 'fundraisers' && <AdminFundraisersPage />}
        {tab === 'checkin' && <Suspense fallback={<div className="card"><Skeleton rows={6} /></div>}><ScannerPage /><div className="mt-8"><VerifyMemberPage /></div></Suspense>}
        {tab === 'members' && <AdminMembersPage />}
        {tab === 'orders' && <AdminOrdersPanel />}
        {tab === 'products' && <AdminProductsPage />}
        {tab === 'announcements' && <AdminAnnouncementsPage />}
        {tab === 'finance' && <Suspense fallback={<div className="card"><Skeleton rows={6} /></div>}><FinanceOverview /></Suspense>}
      </div>
      </div>
      <SecretaryDrawer open={ai} onClose={() => setAi(false)} />
    </>
  );
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
        <Link to="/admin?tab=finance&view=dues" className="interactive rounded-[var(--radius-lg)] focus-ring">
          <MetricCard label="Owed to club" icon={Scale} loading={q.isLoading} value={o ? money(o.dues.owed_to_club) : '—'} className="card-hover h-full"
            hint={o ? <>owed by club <span className={o.dues.owed_by_club ? 'text-danger' : ''}>{money(o.dues.owed_by_club)}</span></> : undefined} />
        </Link>
        <Link to="/admin?tab=fundraisers" className="interactive rounded-[var(--radius-lg)] focus-ring">
          <MetricCard label="Active fundraisers" icon={HandCoins} loading={q.isLoading} value={o?.fundraisers.active ?? '—'} className="card-hover h-full"
            hint={o ? (o.fundraisers.behind ? <span className="text-danger">{o.fundraisers.behind} behind</span> : 'all on track') : undefined} />
        </Link>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {TABS.filter((t) => t.key !== 'overview').map((t) => (
          <Link key={t.key} to={`/admin?tab=${t.key}`} className="card card-hover interactive group flex min-h-16 items-center gap-3 !py-3 focus-ring">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent-text"><t.icon className="size-4" aria-hidden /></span>
            <span className="min-w-0 truncate font-medium">{t.label}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
