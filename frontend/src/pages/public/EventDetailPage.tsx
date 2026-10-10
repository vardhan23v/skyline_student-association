import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CheckCircle2, MapPin, Ticket, Users } from 'lucide-react';
import { get, post } from '@/api/client';
import type { Checkout, Event, Ticket as TicketT } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { LabeledInput } from '@/components/Input';
import { ErrorState, Skeleton } from '@/components/EmptyState';
import { CheckoutModal } from '@/components/CheckoutModal';
import { datetime, money } from '@/components/format';

export function EventDetailPage() {
  const { id } = useParams();
  const { me } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['events', id], queryFn: () => get<Event>(`/events/${id}`) });
  const [guest, setGuest] = useState({ holder_name: '', holder_email: '' });
  const [result, setResult] = useState<{ ticket: TicketT; checkout: Checkout } | null>(null);
  const buy = useMutation({ mutationFn: () => post<{ ticket: TicketT; checkout: Checkout }>(`/events/${id}/tickets`, me ? {} : guest), onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: ['events'] }); qc.invalidateQueries({ queryKey: ['me'] }); } });
  if (q.isLoading) return <div className="card"><Skeleton rows={6} /></div>;
  if (!q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const e = q.data;
  const onSale = e.status === 'published' && e.seats_left > 0;
  const sold = e.capacity - e.seats_left;
  return (
    <>
      <Link to="/events" className="t-label mb-3 inline-flex items-center gap-1 hover:text-accent"><ArrowLeft className="size-3" aria-hidden />Events</Link>
      <PageHeader eyebrow={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1"><span className="inline-flex items-center gap-1"><CalendarDays className="size-3" aria-hidden />{datetime(e.starts_at)}</span>{e.venue && <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{e.venue}</span>}</span>} title={e.title} actions={<StatusBadge status={e.status} />} />
      <div className="grid gap-5 lg:grid-cols-3">
        <article className="card lg:col-span-2 whitespace-pre-wrap text-[15px] leading-relaxed text-text-secondary glow-corner">{e.description || 'No description yet.'}</article>
        <aside className="card space-y-4 self-start lg:sticky lg:top-4" aria-label="Tickets">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-text-secondary">Member price</dt><dd className="t-num font-medium">{money(e.member_price)}</dd></div>
            <div className="flex justify-between"><dt className="text-text-secondary">Non-member price</dt><dd className="t-num font-medium">{money(e.non_member_price)}</dd></div>
            <div className="flex justify-between"><dt className="text-text-secondary">Seats</dt><dd className="t-num font-medium inline-flex items-center gap-1"><Users className="size-3.5 text-text-tertiary" aria-hidden />{e.seats_left} of {e.capacity} left</dd></div>
          </dl>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated" role="progressbar" aria-valuenow={sold} aria-valuemax={e.capacity} aria-label="Seats sold"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((sold / e.capacity) * 100)}%` }} /></div>
          <div className="border-t border-border pt-4">
            <div className="t-label">Your price</div>
            <div className="mt-1 flex items-center gap-2"><span className="t-metric">{e.price_for_you === 0 ? 'Free' : money(e.price_for_you)}</span>{e.you_are_member && <StatusBadge tone="success" status="active">member rate</StatusBadge>}</div>
          </div>
          {!me && (
            <div className="space-y-3">
              <LabeledInput label="Name" autoComplete="name" value={guest.holder_name} onChange={(ev) => setGuest({ ...guest, holder_name: ev.target.value })} />
              <LabeledInput label="Email" type="email" autoComplete="email" value={guest.holder_email} onChange={(ev) => setGuest({ ...guest, holder_email: ev.target.value })} hint={<>Members: <Link className="text-accent" to="/login">log in</Link> for member pricing.</>} />
            </div>
          )}
          <Button className="w-full" disabled={!onSale} loading={buy.isPending} onClick={() => buy.mutate()} icon={<Ticket className="size-4" aria-hidden />}>
            {e.seats_left === 0 ? 'Sold out' : onSale ? (e.price_for_you === 0 ? 'Get free ticket' : 'Buy ticket') : 'Not on sale'}
          </Button>
          <ErrorState error={buy.error} />
          {result && result.checkout === null && (
            <div role="status" className="flex items-start gap-2 rounded-[var(--radius-md)] border border-success/40 bg-success-soft p-3 text-sm text-success"><CheckCircle2 className="size-4 shrink-0 mt-0.5" aria-hidden /><span>Ticket confirmed. {me ? <Link className="underline" to={`/tickets/${result.ticket.id}`}>View your QR</Link> : 'Check your email for the QR code.'}</span></div>
          )}
          <p className="t-caption">Seats are held for 15 minutes while you pay. Your ticket is confirmed only when the payment provider notifies us.</p>
        </aside>
      </div>
      {result?.checkout && <CheckoutModal checkout={result.checkout} title={`Ticket: ${e.title}`} onClose={() => setResult(null)} />}
    </>
  );
}
