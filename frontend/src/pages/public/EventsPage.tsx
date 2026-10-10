import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { get } from '@/api/client';
import type { Event } from '@/api/types';
import { Badge, Empty, PageTitle, datetime, money } from '@/components/ui';

export function EventsPage() {
  const q = useQuery({ queryKey: ['events'], queryFn: () => get<Event[]>('/events') });
  const events = (q.data ?? []).filter((e) => e.status !== 'draft');
  return (
    <>
      <PageTitle title="Events" sub="Members pay less — log in to see your price." />
      {q.isLoading ? 'Loading…' : events.length === 0 ? <Empty>No events yet.</Empty> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <Link to={`/events/${e.id}`} key={e.id} className="card hover:shadow-md transition">
              <div className="flex justify-between items-start gap-2"><h3 className="font-semibold">{e.title}</h3><Badge s={e.status} /></div>
              <p className="text-sm text-slate-500 mt-1">{datetime(e.starts_at)} · {e.venue}</p>
              <p className="text-sm mt-3 line-clamp-2 text-slate-600">{e.description}</p>
              <div className="flex justify-between mt-4 text-sm"><span className="font-medium">{money(e.price_for_you)}{e.you_are_member && <span className="text-emerald-700 text-xs ml-1">member</span>}</span><span className="text-slate-500">{e.seats_left} seats left</span></div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
