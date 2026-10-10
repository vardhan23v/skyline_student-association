import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { get } from '@/api/client';
import type { Event, Fundraiser, Member } from '@/api/types';
import { PageTitle, Stat } from '@/components/ui';

export function AdminHome() {
  const members = useQuery({ queryKey: ['members', 'expiring'], queryFn: () => get<Member[]>('/members?expiring_within_days=14') });
  const all = useQuery({ queryKey: ['members', 'all'], queryFn: () => get<Member[]>('/members') });
  const events = useQuery({ queryKey: ['events'], queryFn: () => get<Event[]>('/events') });
  const frs = useQuery({ queryKey: ['fundraisers'], queryFn: () => get<Fundraiser[]>('/fundraisers') });
  const tiles = [['/admin/members', '👥 Members'], ['/admin/events', '🎟 Events'], ['/admin/announcements', '📣 Announcements'], ['/admin/products', '👕 Products & stock'], ['/admin/fundraisers', '🎯 Fundraisers'], ['/volunteer/tasks', '📋 Task board']];
  return (
    <>
      <PageTitle title="Admin dashboard" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Stat label="Active members" value={all.data?.filter((m) => m.membership_status === 'active').length ?? '…'} hint={`${all.data?.length ?? 0} profiles`} />
        <Stat label="Expiring in 14 days" value={members.data?.length ?? '…'} />
        <Stat label="Upcoming events" value={events.data?.filter((e) => e.status === 'published').length ?? '…'} />
        <Stat label="Active fundraisers" value={frs.data?.filter((f) => f.status === 'active').length ?? '…'} hint={`${frs.data?.reduce((s, f) => s + f.tasks_overdue, 0) ?? 0} overdue tasks`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">{tiles.map(([to, t]) => <Link key={to} to={to} className="card hover:shadow-md font-medium">{t}</Link>)}</div>
    </>
  );
}
