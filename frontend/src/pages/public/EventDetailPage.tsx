import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CheckCircle2, MapPin, QrCode, Ticket, Users } from 'lucide-react';
import { get, post } from '@/api/client';
import type { Checkout, Event, Registration, Ticket as TicketT } from '@/api/types';
import { useAuthAction } from '@/hooks/useAuthAction';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { ErrorState, Skeleton } from '@/components/EmptyState';
import { CheckoutModal } from '@/components/CheckoutModal';
import { useToast } from '@/components/Toast';
import { datetime, money } from '@/components/format';

/** Why the Register button is disabled, or null when registration is open. Mirrors the API's checks. */
export function registerBlock(e: Event): string | null {
  const now = Date.now();
  if (e.status !== 'published') return e.status === 'closed' ? 'Registration closed' : 'Not open yet';
  if (+new Date(e.starts_at) <= now) return 'Event has started';
  if (e.sales_open_at && +new Date(e.sales_open_at) > now) return `Opens ${datetime(e.sales_open_at)}`;
  if (e.sales_close_at && +new Date(e.sales_close_at) < now) return 'Registration closed';
  if (e.seats_left === 0) return 'Sold out';
  return null;
}

export function EventDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['events', id], queryFn: () => get<Event>(`/events/${id}`) });
  const [pay, setPay] = useState<{ checkout: Checkout; ticket: TicketT } | null>(null);
  const done = () => { setPay(null); qc.invalidateQueries({ queryKey: ['events'] }); qc.invalidateQueries({ queryKey: ['me'] }); };
  const register = useMutation({
    mutationFn: () => post<Registration>(`/events/${id}/register`),
    onSuccess: (r) => {
      if (r.checkout) { setPay({ checkout: r.checkout, ticket: r.ticket }); return; }
      toast.success("You're registered", 'Your ticket and QR are in My account.');
      done();
    },
    onError: (e: any) => { if (e?.code === 'ALREADY_REGISTERED' || e?.code === 'SOLD_OUT') qc.invalidateQueries({ queryKey: ['events', id] }); },
  });
  // `?action=register` (back from login, or from an event card) resumes the registration once the event has loaded.
  const [resume, setResume] = useState(false);
  const { runProtected, card } = useAuthAction({ onResume: (a) => { if (a === 'register') setResume(true); } });
  const run = () => runProtected(() => register.mutateAsync(), { requireMember: true, resume: 'register', reason: q.data ? `${q.data.title} is for SSA members.` : undefined });
  useEffect(() => { if (resume && q.data) { setResume(false); void run().catch(() => {}); } }, [resume, q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading) return <div className="card"><Skeleton rows={6} /></div>;
  if (!q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const e = q.data;
  const v = e.viewer;
  const sold = e.capacity - e.seats_left;
  const blocked = registerBlock(e);
  const pendingTicket = v.ticket?.status === 'pending';

  let cta;
  if (v.registered && v.ticket) cta = <Link to={`/tickets/${v.ticket.id}`} className="btn-primary w-full"><QrCode className="size-4" aria-hidden />View ticket</Link>;
  else if (pendingTicket) cta = <Button className="w-full" loading={register.isPending} onClick={() => void run().catch(() => {})} icon={<Ticket className="size-4" aria-hidden />}>Complete payment</Button>;
  else if (blocked) cta = <Button className="w-full" disabled icon={<Ticket className="size-4" aria-hidden />}>{blocked}</Button>;
  else cta = <Button className="w-full" loading={register.isPending} onClick={() => void run().catch(() => {})} icon={<Ticket className="size-4" aria-hidden />}>{e.price === 0 ? 'Register' : `Register · ${money(e.price)}`}</Button>;

  return (
    <>
      <Link to="/events" className="t-label mb-3 inline-flex items-center gap-1 hover:text-accent-text"><ArrowLeft className="size-3" aria-hidden />Events</Link>
      <PageHeader eyebrow={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1"><span className="inline-flex items-center gap-1"><CalendarDays className="size-3" aria-hidden />{datetime(e.starts_at)}</span>{e.venue && <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{e.venue}</span>}</span>} script="event" title={e.title} actions={<StatusBadge status={e.status} />} />
      <div className="grid gap-5 lg:grid-cols-3">
        <article className="card lg:col-span-2 whitespace-pre-wrap text-[15px] leading-relaxed text-text-secondary glow-corner">{e.description || 'No description yet.'}</article>
        <aside className="card space-y-4 self-start lg:sticky lg:top-28" aria-label="Registration">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-text-secondary">Member price</dt><dd className="t-num font-medium">{e.price === 0 ? 'Free' : money(e.price)}</dd></div>
            <div className="flex justify-between"><dt className="text-text-secondary">Seats</dt><dd className="t-num font-medium inline-flex items-center gap-1"><Users className="size-3.5 text-text-tertiary" aria-hidden />{e.seats_left} of {e.capacity} left</dd></div>
          </dl>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated" role="progressbar" aria-valuenow={sold} aria-valuemax={e.capacity} aria-label="Seats taken"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((sold / e.capacity) * 100)}%` }} /></div>
          {v.registered && <div role="status" className="flex items-start gap-2 rounded-[var(--radius-md)] border border-success/40 bg-success-soft p-3 text-sm text-success"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /><span>You're registered for this event.</span></div>}
          {cta}
          <ErrorState error={register.error} />
          <p className="t-caption">{v.logged_in && !v.is_member && !v.registered ? 'Registration is for SSA members. You can join in one step.' : 'Members only. Paid seats are held for 15 minutes while you pay.'}</p>
        </aside>
      </div>
      {card}
      {pay && <CheckoutModal checkout={pay.checkout} title={`Ticket: ${e.title}`} onClose={done}
        onPaid={() => { toast.success("You're registered", 'Your ticket and QR are in My account.'); done(); }}
        confirmed={() => get<TicketT>(`/tickets/${pay.ticket.id}`).then((t) => t.status === 'confirmed')} />}
    </>
  );
}
