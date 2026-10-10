import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, ClipboardList, Megaphone, Shirt, Target, Users } from 'lucide-react';
import { get } from '@/api/client';
import type { Event, Fundraiser, Member } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { MetricCard } from '@/components/MetricCard';

const tiles = [
  { to: '/admin/members', t: 'Members', d: 'Dues, expiry, renewals', icon: Users },
  { to: '/admin/events', t: 'Events', d: 'Create, publish, report', icon: CalendarDays },
  { to: '/admin/announcements', t: 'Announcements', d: 'Post + email in one step', icon: Megaphone },
  { to: '/admin/products', t: 'Products & stock', d: 'Variants, stock, orders', icon: Shirt },
  { to: '/admin/fundraisers', t: 'Fundraisers', d: 'Targets and budgets', icon: Target },
  { to: '/volunteer/tasks', t: 'Task board', d: 'Assign and track work', icon: ClipboardList },
];

export function AdminHome() {
  const members = useQuery({ queryKey: ['members', 'expiring'], queryFn: () => get<Member[]>('/members?expiring_within_days=14') });
  const all = useQuery({ queryKey: ['members', 'all'], queryFn: () => get<Member[]>('/members') });
  const events = useQuery({ queryKey: ['events'], queryFn: () => get<Event[]>('/events') });
  const frs = useQuery({ queryKey: ['fundraisers'], queryFn: () => get<Fundraiser[]>('/fundraisers') });
  const overdue = frs.data?.reduce((s, f) => s + f.tasks_overdue, 0) ?? 0;
  return (
    <>
      <PageHeader eyebrow="Admin" title="Administration" description="Content and membership controls. Finance writes stay with the treasurer." actions={<Link to="/dashboard" className="btn-secondary">Dashboard</Link>} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <MetricCard label="Active members" icon={Users} loading={all.isLoading} value={all.data?.filter((m) => m.membership_status === 'active').length ?? '—'} hint={`${all.data?.length ?? 0} profiles`} />
        <MetricCard label="Expiring in 14 days" icon={Users} loading={members.isLoading} value={members.data?.length ?? '—'} tone={(members.data?.length ?? 0) > 0 ? 'warning' : 'default'} />
        <MetricCard label="Published events" icon={CalendarDays} loading={events.isLoading} value={events.data?.filter((e) => e.status === 'published').length ?? '—'} hint={`${events.data?.filter((e) => e.status === 'draft').length ?? 0} drafts`} />
        <MetricCard label="Active fundraisers" icon={Target} loading={frs.isLoading} value={frs.data?.filter((f) => f.status === 'active').length ?? '—'} hint={overdue ? `${overdue} overdue tasks` : 'no overdue tasks'} tone={overdue ? 'danger' : 'default'} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((x) => (
          <Link key={x.to} to={x.to} className="card card-hover interactive group flex items-center gap-4 focus-ring">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent"><x.icon className="size-5" aria-hidden /></span>
            <span className="min-w-0 flex-1"><span className="block font-medium">{x.t}</span><span className="t-caption block">{x.d}</span></span>
            <ArrowRight className="size-4 text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        ))}
      </div>
    </>
  );
}
