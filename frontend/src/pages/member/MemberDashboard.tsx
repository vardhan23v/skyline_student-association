import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CreditCard, QrCode, ShoppingBag, Ticket } from 'lucide-react';
import { get, post } from '@/api/client';
import type { Checkout } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { CheckoutModal } from '@/components/CheckoutModal';
import { date, datetime, money } from '@/components/format';

/** Member account: membership card with QR, tickets, orders. */
export function MemberDashboard() {
  const { me } = useAuth();
  const [qr, setQr] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<Checkout>(null);
  const qc = useQueryClient();
  const orders = useQuery({ queryKey: ['orders'], queryFn: () => get<any[]>('/orders') });
  // GET /orders returns every club order for admins (it doubles as the fulfilment list); this page is "My orders".
  const myOrders = orders.data && me ? orders.data.filter((o) => Number(o.user_id) === me.user.id) : undefined;
  const pay = useMutation({ mutationFn: () => post<{ checkout: Checkout }>('/memberships', {}), onSuccess: (r) => { setCheckout(r.checkout); qc.invalidateQueries({ queryKey: ['me'] }); } });
  useEffect(() => {
    if (!me?.qr_token) return setQr(null);
    (async () => { try { const QR = await import('qrcode'); setQr(await QR.toDataURL(me.qr_token!, { margin: 1, width: 240, color: { dark: '#000000', light: '#ffffff' } })); } catch { setQr(null); } })(); // dark-on-light: inverted QRs fail many scanners
  }, [me?.qr_token]);
  if (!me) return null;
  const ms = me.membership;
  return (
    <>
      <PageHeader eyebrow={`Member · ${me.user.email}`} title="My account" description="Your membership, tickets and orders." />
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card glow-horizon flex flex-col" aria-labelledby="ms-h">
          <div className="flex items-start justify-between gap-2"><h2 id="ms-h" className="t-section">Membership</h2><StatusBadge status={me.active ? 'active' : ms?.status ?? undefined}>{me.active ? 'active' : ms?.status ?? 'none'}</StatusBadge></div>
          {!me.member ? <p className="mt-3 text-sm text-text-secondary">No member profile yet. Visit the sign-up table or contact an admin to add your student ID.</p> : (<>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="t-label">Student ID</dt><dd className="mt-0.5 font-mono">{me.member.student_id}</dd></div>
              <div><dt className="t-label">{me.active ? 'Expires' : ms?.status === 'expired' ? 'Expired' : 'Expiry'}</dt><dd className="mt-0.5">{ms?.expiry_date ? date(ms.expiry_date) : '—'}</dd></div>
            </dl>
            {me.active && (qr ? <figure className="mt-5 text-center"><img src={qr} alt="Your membership QR code" width={240} height={240} className="mx-auto rounded-[var(--radius-md)] bg-white p-2" /><figcaption className="t-caption mt-2 inline-flex items-center gap-1"><QrCode className="size-3" aria-hidden />Show this at events to verify membership.</figcaption></figure> : <div className="mt-5 mx-auto size-60 skeleton rounded-[var(--radius-md)]" aria-label="Loading QR" />)}
            {!me.active && <div className="mt-5 space-y-2"><Button className="w-full" loading={pay.isPending} onClick={() => pay.mutate()} icon={<CreditCard className="size-4" aria-hidden />}>Pay dues · {money(500)}</Button><ErrorState error={pay.error} /><p className="t-caption">Activates on payment confirmation and unlocks member pricing.</p></div>}
          </>)}
        </section>
        <section className="lg:col-span-2" aria-labelledby="tk-h">
          <SectionHeader title={<span id="tk-h">My tickets</span>} meta={`${me.tickets.length}`} actions={<Link to="/events" className="t-label hover:text-accent">Browse events →</Link>} />
          <DataTable rows={me.tickets} rowKey={(t) => t.id} caption="Your tickets" empty={<EmptyState icon={<Ticket className="size-5" aria-hidden />} title="No tickets yet" action={<Link to="/events" className="btn-secondary">Browse events</Link>} />}
            columns={[
              { key: 'event', header: 'Event', render: (t) => <span className="font-medium">{t.event_title}</span> },
              { key: 'when', header: 'When', render: (t) => datetime(t.starts_at) },
              { key: 'type', header: 'Type', render: (t) => <span className="capitalize">{t.ticket_type.replace('_', ' ')}</span>, hideOnMobile: true },
              { key: 'price', header: 'Price', render: (t) => <span className="t-num">{money(t.price)}</span>, align: 'right' },
              { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
              { key: 'qr', header: '', render: (t) => t.status !== 'pending' && t.status !== 'cancelled' ? <Link to={`/tickets/${t.id}`} className="btn-secondary !min-h-9 !px-3 !text-xs"><QrCode className="size-3.5" aria-hidden />QR</Link> : null, align: 'right' },
            ]} />
        </section>
        <section className="lg:col-span-3" aria-labelledby="or-h">
          <SectionHeader title={<span id="or-h">My orders</span>} actions={<Link to="/shop" className="t-label hover:text-accent">Visit the shop →</Link>} />
          <DataTable rows={myOrders} loading={orders.isLoading} error={orders.error} onRetry={() => orders.refetch()} rowKey={(o) => o.id} caption="Your merchandise orders" empty={<EmptyState icon={<ShoppingBag className="size-5" aria-hidden />} title="No orders yet" action={<Link to="/shop" className="btn-secondary">Visit the shop</Link>} />}
            columns={[
              { key: 'id', header: 'Order', render: (o) => <span className="font-mono">#{o.id}</span> },
              { key: 'total', header: 'Total', render: (o) => <span className="t-num">{money(o.total)}</span>, align: 'right' },
              { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
              { key: 'placed', header: 'Placed', render: (o) => datetime(o.created_at), hideOnMobile: true },
            ]} />
        </section>
      </div>
      {checkout && <CheckoutModal checkout={checkout} title="Membership dues" onClose={() => setCheckout(null)} />}
    </>
  );
}
