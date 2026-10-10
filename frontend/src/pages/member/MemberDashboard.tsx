import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { get, post } from '@/api/client';
import type { Checkout } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Empty, ErrorBox, PageTitle, date, datetime, money } from '@/components/ui';
import { CheckoutModal } from '@/components/CheckoutModal';

export function MemberDashboard() {
  const { me } = useAuth();
  const [qr, setQr] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<Checkout>(null);
  const orders = useQuery({ queryKey: ['orders'], queryFn: () => get<any[]>('/orders') });
  const pay = useMutation({ mutationFn: () => post<{ checkout: Checkout }>('/memberships', {}), onSuccess: (r) => setCheckout(r.checkout) });
  useEffect(() => {
    if (!me?.qr_token) return setQr(null);
    (async () => { try { const QR = await import('qrcode'); setQr(await QR.toDataURL(me.qr_token!, { margin: 1, width: 220 })); } catch { setQr(null); } })();
  }, [me?.qr_token]);
  if (!me) return null;
  const ms = me.membership;
  return (
    <>
      <PageTitle title={`Hi ${me.user.name.split(' ')[0]}`} sub="Your membership, tickets and orders." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card">
          <h3 className="font-semibold mb-2">Membership</h3>
          {!me.member ? <p className="text-sm text-slate-600">No member profile yet. Visit the sign-up table or contact an admin to add your student ID.</p> : (<>
            <p className="text-sm">Student ID <b>{me.member.student_id}</b></p>
            <p className="text-sm mt-1">Status <Badge s={me.active ? 'active' : ms?.status ?? 'none'} /> {ms && <span className="text-slate-500">· expires {date(ms.expiry_date)}</span>}</p>
            {me.active && qr && <div className="mt-3 text-center"><img src={qr} alt="Member QR" className="mx-auto rounded" /><p className="text-xs text-slate-500 mt-1">Show this at events to verify membership.</p></div>}
            {!me.active && <><button className="btn-primary mt-3 w-full" disabled={pay.isPending} onClick={() => pay.mutate()}>Pay dues · {money(500)}</button><ErrorBox error={pay.error} /></>}
          </>)}
        </div>
        <div className="card lg:col-span-2">
          <h3 className="font-semibold mb-2">My tickets</h3>
          {me.tickets.length === 0 ? <Empty>No tickets yet. <Link to="/events" className="text-indigo-600">Browse events</Link></Empty> : (
            <table className="table"><thead><tr><th>Event</th><th>When</th><th>Type</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody>
              {me.tickets.map((t) => <tr key={t.id}><td>{t.event_title}</td><td>{datetime(t.starts_at)}</td><td>{t.ticket_type.replace('_', ' ')}</td><td>{money(t.price)}</td><td><Badge s={t.status} /></td><td>{t.status !== 'pending' && t.status !== 'cancelled' && <Link to={`/tickets/${t.id}`} className="text-indigo-600 text-xs">QR</Link>}</td></tr>)}
            </tbody></table>
          )}
        </div>
        <div className="card lg:col-span-3">
          <h3 className="font-semibold mb-2">My orders</h3>
          {!orders.data?.length ? <Empty>No orders yet. <Link to="/shop" className="text-indigo-600">Visit the shop</Link></Empty> : (
            <table className="table"><thead><tr><th>#</th><th>Total</th><th>Status</th><th>Placed</th></tr></thead><tbody>
              {orders.data.map((o) => <tr key={o.id}><td>{o.id}</td><td>{money(o.total)}</td><td><Badge s={o.status} /></td><td>{datetime(o.created_at)}</td></tr>)}
            </tbody></table>
          )}
        </div>
      </div>
      {checkout && <CheckoutModal checkout={checkout} title="Membership dues" onClose={() => setCheckout(null)} />}
    </>
  );
}
