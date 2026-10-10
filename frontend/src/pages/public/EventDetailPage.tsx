import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, CalendarDays, CheckCircle2, MapPin, QrCode, Ticket, Users } from 'lucide-react';
import { get, post } from '@/api/client';
import type { Checkout, Event, MembershipOffer, Registration, Ticket as TicketT } from '@/api/types';
import { useAuthAction } from '@/hooks/useAuthAction';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { ErrorState, Skeleton } from '@/components/EmptyState';
import { CheckoutModal } from '@/components/CheckoutModal';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { date, datetime, eventPrice, money } from '@/components/format';
import { EventArt } from '@/components/Skyline';

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
  // Non-members choose: pay the non-member price, or join first and pay the member price.
  const [choose, setChoose] = useState(false);
  const offer = useQuery({ queryKey: ['membership', 'info'], queryFn: () => get<MembershipOffer>('/membership/info'), enabled: choose || (!!q.data?.viewer.logged_in && !q.data.viewer.is_member && !q.data.members_only), staleTime: 5 * 60_000 });
  /** Register at the caller's price. `asMember` opens the membership card first (and members_only events always do). */
  const run = (asMember = false) => {
    const e = q.data;
    const reason = !e ? undefined : e.members_only ? `${e.title} is for SSA members.` : `Members pay ${e.member_price === 0 ? 'nothing' : money(e.member_price)} for ${e.title}.`;
    return runProtected(() => register.mutateAsync(), { requireMember: asMember || !!e?.members_only, resume: 'register', reason });
  };
  /** The Register button: a non-member who would save by joining gets the choice first. */
  const start = () => {
    const e = q.data;
    if (e && e.viewer.logged_in && !e.viewer.is_member && !e.members_only && !e.viewer.ticket && e.member_price < e.non_member_price) { setChoose(true); return; }
    void run().catch(() => {});
  };
  useEffect(() => { if (resume && q.data) { setResume(false); start(); } }, [resume, q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading) return <div className="card"><Skeleton rows={6} /></div>;
  if (!q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const e = q.data;
  const v = e.viewer;
  const sold = e.capacity - e.seats_left;
  const blocked = registerBlock(e);
  const pendingTicket = v.ticket?.status === 'pending';

  // One CTA, four states: View ticket / Register (or Complete payment) / Become a member (members-only events) / Sold out (or another block).
  const joinFirst = v.logged_in && !v.is_member && e.members_only;
  const fmt = (n: number) => (n === 0 ? 'Free' : money(n));
  // What this caller pays; signed out, the non-member price (or the member price on a members-only event).
  const yours = e.price_for_you ?? e.member_price;
  const price = fmt(yours);
  let cta;
  if (v.registered && v.ticket) cta = <Link to={`/tickets/${v.ticket.id}`} className="btn-primary w-full !min-h-12"><QrCode className="size-4" aria-hidden />View ticket</Link>;
  else if (pendingTicket) cta = <Button className="w-full !min-h-12" loading={register.isPending} onClick={() => void run().catch(() => {})} icon={<Ticket className="size-4" aria-hidden />}>Complete payment</Button>;
  else if (blocked) cta = <Button className="w-full !min-h-12" disabled icon={<Ticket className="size-4" aria-hidden />}>{blocked}</Button>;
  else if (joinFirst) cta = <Button className="w-full !min-h-12" loading={register.isPending} onClick={() => void run().catch(() => {})} icon={<Ticket className="size-4" aria-hidden />}>Become a member</Button>;
  else cta = <Button className="w-full !min-h-12" loading={register.isPending} onClick={start} icon={<Ticket className="size-4" aria-hidden />}>{yours === 0 ? 'Register' : `Register · ${price}`}</Button>;
  const caption = e.members_only
    ? (joinFirst && !v.registered ? 'This event is for SSA members. You can join in one step.' : 'Members only. Paid seats are held for 15 minutes while you pay.')
    : v.is_member ? 'You pay the member price. Paid seats are held for 15 minutes while you pay.'
    : e.member_price < e.non_member_price ? `Open to everyone. Members pay ${fmt(e.member_price)}. Paid seats are held for 15 minutes while you pay.`
    : 'Open to everyone. Paid seats are held for 15 minutes while you pay.';

  return (
    <>
      <Link to="/events" className="t-label mb-2 inline-flex min-h-11 items-center gap-1 hover:text-accent-text"><ArrowLeft className="size-3" aria-hidden />Events</Link>
      {/* Phones: art, then title / date / venue, then seats; the CTA lives in the sticky bottom bar. */}
      <EventArt seed={e.id} className="mb-5 h-36 w-full overflow-hidden rounded-[var(--radius-lg)] border border-border sm:h-44 lg:hidden" />
      <PageHeader eyebrow={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1"><span className="inline-flex items-center gap-1"><CalendarDays className="size-3" aria-hidden />{datetime(e.starts_at)}</span>{e.venue && <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{e.venue}</span>}</span>} script="event" title={e.title} actions={<StatusBadge status={e.status} />} />
      <div className="grid gap-5 lg:grid-cols-3">
        <aside className="card order-first space-y-4 self-start lg:order-none lg:col-start-3 lg:row-start-1 lg:sticky lg:top-28" aria-label="Registration">
          <dl className="space-y-2 text-base md:text-sm">
            {e.members_only
              ? <div className="flex justify-between"><dt className="text-text-secondary">Members only</dt><dd className="t-num font-medium">{fmt(e.member_price)}</dd></div>
              : <>
                <div className="flex justify-between"><dt className="text-text-secondary">Price</dt><dd className={`t-num font-medium ${v.is_member && e.member_price < e.non_member_price ? 'text-text-tertiary line-through' : ''}`}>{fmt(e.non_member_price)}</dd></div>
                <div className="flex justify-between"><dt className="text-text-secondary">Member price</dt><dd className="t-num font-medium">{fmt(e.member_price)}</dd></div>
              </>}
            <div className="flex justify-between"><dt className="text-text-secondary">Seats</dt><dd className="t-num font-medium inline-flex items-center gap-1"><Users className="size-3.5 text-text-tertiary" aria-hidden />{e.seats_left === 0 ? 'Sold out' : `${e.seats_left} of ${e.capacity} left`}</dd></div>
          </dl>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated" role="progressbar" aria-valuenow={sold} aria-valuemax={e.capacity} aria-label="Seats taken"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((sold / e.capacity) * 100)}%` }} /></div>
          {v.registered && <div role="status" className="flex items-start gap-2 rounded-[var(--radius-md)] border border-success/40 bg-success-soft p-3 text-sm text-success"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /><span>You're registered for this event.</span></div>}
          <div className="hidden lg:block">{cta}</div>
          <ErrorState error={register.error} />
          <p className="t-caption">{caption}</p>
        </aside>
        <article className="card lg:col-span-2 lg:row-start-1 whitespace-pre-wrap text-base leading-relaxed text-text-secondary glow-corner md:text-[15px]">{e.description || 'No description yet.'}</article>
      </div>
      {/* Sticky bottom bar under lg, clear of the home indicator. The spacer keeps the last content above it. */}
      <div className="h-24 lg:hidden" aria-hidden />
      <div className="glass fixed inset-x-0 bottom-0 z-30 rounded-t-[var(--radius-xl)] border-x-0 border-b-0 px-4 pt-3 pb-safe lg:hidden" role="region" aria-label="Register">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 shrink-0"><div className="t-label">{e.seats_left === 0 ? 'Sold out' : `${e.seats_left} left`}</div><div className="t-num font-medium">{v.logged_in ? price : eventPrice(e)}</div></div>
          <div className="min-w-0 flex-1">{cta}</div>
        </div>
      </div>
      {card}
      <Modal open={choose} onClose={() => setChoose(false)} title="How do you want to register?" description={e.title}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <Button variant="secondary" className="w-full !min-h-14 !whitespace-normal" onClick={() => { setChoose(false); void run().catch(() => {}); }} icon={<Ticket className="size-4" aria-hidden />}>
            {e.non_member_price === 0 ? 'Register free' : `Pay ${money(e.non_member_price)}`}
          </Button>
          <Button className="w-full !min-h-14 !h-auto !whitespace-normal !py-3 text-center" onClick={() => { setChoose(false); void run(true).catch(() => {}); }} icon={<BadgeCheck className="size-4" aria-hidden />}>
            {`Become a member${offer.data ? ` (${money(offer.data.price)})` : ''} and ${e.member_price === 0 ? 'register free' : `pay ${money(e.member_price)}`}`}
          </Button>
          <p className="t-caption">Members also get member prices on every event and in the shop{offer.data?.valid_until ? `, until ${date(offer.data.valid_until)}` : ''}.</p>
        </div>
      </Modal>
      {pay && <CheckoutModal checkout={pay.checkout} title={`Ticket: ${e.title}`} onClose={done}
        onPaid={() => { toast.success("You're registered", 'Your ticket and QR are in My account.'); done(); }}
        confirmed={() => get<TicketT>(`/tickets/${pay.ticket.id}`).then((t) => t.status === 'confirmed')} />}
    </>
  );
}
