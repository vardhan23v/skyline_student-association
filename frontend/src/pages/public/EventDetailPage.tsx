import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { get, post } from '@/api/client';
import type { Checkout, Event, Ticket } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Badge, ErrorBox, Field, PageTitle, datetime, money } from '@/components/ui';
import { CheckoutModal } from '@/components/CheckoutModal';

export function EventDetailPage() {
  const { id } = useParams();
  const { me } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['events', id], queryFn: () => get<Event>(`/events/${id}`) });
  const [guest, setGuest] = useState({ holder_name: '', holder_email: '' });
  const [result, setResult] = useState<{ ticket: Ticket; checkout: Checkout } | null>(null);
  const buy = useMutation({ mutationFn: () => post<{ ticket: Ticket; checkout: Checkout }>(`/events/${id}/tickets`, me ? {} : guest), onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: ['events'] }); qc.invalidateQueries({ queryKey: ['me'] }); } });
  if (q.isLoading) return <p>Loading…</p>;
  if (!q.data) return <ErrorBox error={q.error} />;
  const e = q.data;
  const onSale = e.status === 'published' && e.seats_left > 0;
  return (
    <>
      <PageTitle title={e.title} sub={`${datetime(e.starts_at)} · ${e.venue ?? ''}`} action={<Badge s={e.status} />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 card whitespace-pre-wrap text-slate-700">{e.description}</div>
        <div className="card space-y-3">
          <div className="flex justify-between text-sm"><span>Member price</span><b>{money(e.member_price)}</b></div>
          <div className="flex justify-between text-sm"><span>Non-member price</span><b>{money(e.non_member_price)}</b></div>
          <div className="flex justify-between text-sm"><span>Seats left</span><b>{e.seats_left} / {e.capacity}</b></div>
          <hr />
          <div className="text-lg">Your price: <b>{money(e.price_for_you)}</b> {e.you_are_member && <span className="badge bg-emerald-100 text-emerald-800">active member</span>}</div>
          {!me && (<>
            <Field label="Name"><input className="input" value={guest.holder_name} onChange={(ev) => setGuest({ ...guest, holder_name: ev.target.value })} /></Field>
            <Field label="Email"><input className="input" type="email" value={guest.holder_email} onChange={(ev) => setGuest({ ...guest, holder_email: ev.target.value })} /></Field>
            <p className="text-xs text-slate-500">Members: <Link className="text-indigo-600" to="/login">log in</Link> for member pricing.</p>
          </>)}
          <button className="btn-primary w-full" disabled={!onSale || buy.isPending} onClick={() => buy.mutate()}>{e.seats_left === 0 ? 'Sold out' : onSale ? (e.price_for_you === 0 ? 'Get free ticket' : 'Buy ticket') : 'Not on sale'}</button>
          <ErrorBox error={buy.error} />
          {result && result.checkout === null && <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">Ticket confirmed! {me ? <Link className="underline" to={`/tickets/${result.ticket.id}`}>View QR</Link> : 'Check your email for the QR code.'}</div>}
        </div>
      </div>
      {result?.checkout && <CheckoutModal checkout={result.checkout} title={`Ticket: ${e.title}`} onClose={() => setResult(null)} />}
    </>
  );
}
