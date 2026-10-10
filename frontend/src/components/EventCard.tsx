import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, QrCode, Ticket } from 'lucide-react';
import type { Event } from '@/api/types';
import { loginUrl } from '@/auth/redirect';
import { registerBlock } from '@/pages/public/EventDetailPage';
import { StatusBadge } from './StatusBadge';
import { datetime, money } from './format';
import { EventArt } from './Skyline';

/**
 * Discovery card: date block, title, venue, member price, capacity bar and a Register button.
 * The title link covers the card; the button sits above it. Registering hands off to the event page with
 * `?action=register` (or to /login first), which runs the shared useAuthAction flow.
 */
export function EventCard({ event: e, to = `/events/${e.id}`, preview = false }: { event: Event; to?: string; /** Show the cursor-following media preview on hover (homepage). */ preview?: boolean }) {
  const d = new Date(e.starts_at);
  const sold = e.capacity - e.seats_left;
  const pct = e.capacity ? Math.round((sold / e.capacity) * 100) : 0;
  const soldOut = e.seats_left === 0;
  const v = e.viewer;
  const blocked = registerBlock(e);
  const registerTo = v.logged_in ? `${to}?action=register` : loginUrl(to, 'register');
  return (
    <article data-cursor-media={preview ? e.title : undefined} className="card card-hover interactive group relative flex min-w-0 flex-col gap-4 overflow-hidden">
      <EventArt seed={e.id} className="-mx-5 -mt-5 h-24 w-[calc(100%+2.5rem)] border-b border-border" />
      <div className="flex items-start justify-between gap-3">
        <div className="card-sunken flex w-14 shrink-0 flex-col items-center py-2" aria-hidden>
          <span className="t-label">{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
          <span className="t-metric !text-2xl">{d.getDate()}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="t-section group-hover:text-accent-text transition-colors" style={{ transitionDuration: 'var(--dur-fast)' }}>
            <Link to={to} className="focus-ring rounded after:absolute after:inset-0 after:content-['']">{e.title}</Link>
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 t-caption"><span className="inline-flex items-center gap-1"><CalendarDays className="size-3" aria-hidden />{datetime(e.starts_at)}</span>{e.venue && <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{e.venue}</span>}</p>
        </div>
        <StatusBadge status={e.status} />
      </div>
      {e.description && <p className="line-clamp-2 text-sm text-text-secondary">{e.description}</p>}
      <div className="mt-auto">
        <div className="flex items-end justify-between gap-3 text-sm">
          <span className="font-medium t-num">{e.price === 0 ? 'Free' : money(e.price)}<span className="ml-1.5 t-label">members</span></span>
          <span className="inline-flex items-center gap-1 t-caption"><Ticket className="size-3" aria-hidden />{soldOut ? 'Sold out' : `${e.seats_left} of ${e.capacity} left`}</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-elevated" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% of seats taken`}>
          <div className={`h-full rounded-full ${soldOut ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="relative z-10 mt-4">
          {v.registered && v.ticket ? <Link to={`/tickets/${v.ticket.id}`} className="btn-secondary w-full !text-xs"><QrCode className="size-3.5" aria-hidden />View ticket</Link>
            : v.ticket?.status === 'pending' ? <Link to={`${to}?action=register`} className="btn-primary w-full !text-xs">Complete payment</Link>
            : blocked ? <span className="btn-secondary w-full !text-xs pointer-events-none opacity-60" aria-disabled="true">{blocked}</span>
            : <Link to={registerTo} className="btn-primary w-full !text-xs"><Ticket className="size-3.5" aria-hidden />Register<span className="sr-only"> for {e.title}</span></Link>}
        </div>
      </div>
    </article>
  );
}
