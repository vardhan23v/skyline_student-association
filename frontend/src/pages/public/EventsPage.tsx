import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { get } from '@/api/client';
import type { Event } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { EventCard } from '@/components/EventCard';
import { EmptyState, ErrorState } from '@/components/EmptyState';

type Filter = 'upcoming' | 'past' | 'all';

export function EventsPage() {
  const { me } = useAuth();
  const q = useQuery({ queryKey: ['events'], queryFn: () => get<Event[]>('/events') });
  const [filter, setFilter] = useState<Filter>('upcoming');
  const now = Date.now();
  const events = (q.data ?? []).filter((e) => e.status !== 'draft').filter((e) => filter === 'all' ? true : filter === 'upcoming' ? +new Date(e.starts_at) >= now : +new Date(e.starts_at) < now)
    .sort((a, b) => (filter === 'past' ? +new Date(b.starts_at) - +new Date(a.starts_at) : +new Date(a.starts_at) - +new Date(b.starts_at)));
  return (
    <>
      <PageHeader eyebrow="Events" title="What's on" description={me ? (me.active ? 'Member pricing is applied to everything below.' : 'Activate your membership for member pricing.') : 'Members pay less. Log in to see your price.'}
        actions={<div role="tablist" aria-label="Filter events" className="card-sunken flex p-1">{(['upcoming', 'past', 'all'] as Filter[]).map((f) => <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`interactive min-h-10 rounded-[var(--radius-sm)] px-3 text-xs font-medium capitalize ${filter === f ? 'bg-surface-elevated text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}>{f}</button>)}</div>} />
      {q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="card h-52 skeleton" />)}</div>
      ) : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : events.length === 0 ? (
        <EmptyState icon={<CalendarDays className="size-5" aria-hidden />} title={filter === 'upcoming' ? 'No upcoming events' : 'No events here'} description="New events are announced to members first." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{events.map((e) => <EventCard key={e.id} event={e} />)}</div>
      )}
    </>
  );
}
