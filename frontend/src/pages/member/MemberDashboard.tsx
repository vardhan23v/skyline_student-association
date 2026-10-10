import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, Check, CheckCircle2, QrCode, RefreshCw, ShoppingBag, Ticket } from 'lucide-react';
import { get } from '@/api/client';
import type { MembershipOffer, Order } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { MembershipCard } from '@/components/MembershipCard';
import { useToast } from '@/components/Toast';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { date, datetime, money } from '@/components/format';

/** Account: membership (with QR, or "Become a member"), my tickets, my orders. Phones: that order, one column, with
 *  tickets and orders as card lists (DataTable card mode). */
export function MemberDashboard() {
  const { me, refreshMe } = useAuth();
  const [qr, setQr] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const offer = useQuery({ queryKey: ['membership', 'info'], queryFn: () => get<MembershipOffer>('/membership/info'), staleTime: 5 * 60_000 });
  const qc = useQueryClient(); const toast = useToast();
  // Polled so a status change made by an admin (paid → fulfilled) shows up without a reload.
  const orders = useQuery({ queryKey: ['orders', 'mine'], queryFn: () => get<Order[]>('/orders/mine'), refetchInterval: 10_000 });
  const joined = async () => { setJoining(false); await refreshMe(); qc.invalidateQueries(); toast.success('Welcome to SSA', 'Your membership is active.'); };
  const renewed = async () => { setRenewing(false); await refreshMe(); qc.invalidateQueries(); toast.success('Membership renewed', 'Your next period is paid.'); };
  useEffect(() => {
    if (!me?.qr_token) return setQr(null);
    (async () => { try { const QR = await import('qrcode'); setQr(await QR.toDataURL(me.qr_token!, { margin: 1, width: 720, /* 3x the 240px it's shown at: sharp on phone screens */ color: { dark: '#0B0B0D', light: '#F6E9CE' } })); } catch { setQr(null); } })(); // dark-on-light (midnight on cream): inverted QRs fail many scanners
  }, [me?.qr_token]);
  if (!me) return null;
  const ms = me.membership;
  return (
    <>
      <PageHeader eyebrow={me.user.email} script="your" title="Account" description="Your membership, tickets and orders." />
      <div className="grid gap-6 md:gap-5 lg:grid-cols-3">
        <section className="card glow-horizon flex flex-col" aria-labelledby="ms-h">
          <div className="flex items-start justify-between gap-2"><h2 id="ms-h" className="t-section">Membership</h2><StatusBadge status={me.is_member ? 'active' : ms?.status ?? undefined}>{me.is_member ? 'active' : ms?.status === 'expired' ? 'expired' : 'not a member'}</StatusBadge></div>

          {/* Renewal: a reminder banner from 30 days before expiry, or once it has ended. */}
          {me.is_member && me.can_renew && me.days_left != null && (
            <div role="status" className="mt-4 rounded-[var(--radius-md)] border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
              <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{me.days_left === 0 ? 'Your membership ends today.' : `Your membership ends in ${me.days_left} day${me.days_left === 1 ? '' : 's'} (${date(me.membership_expires)}).`} Renew now to stay registered for events.</p>
              <Button className="mt-3 w-full" onClick={() => setRenewing(true)} icon={<RefreshCw className="size-4" aria-hidden />}>Renew membership</Button>
            </div>
          )}
          {!me.is_member && ms?.status === 'expired' && (
            <div role="status" className="mt-4 rounded-[var(--radius-md)] border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
              <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />Your membership ended on {date(ms.expiry_date)}. Renew to register for events again.</p>
            </div>
          )}
          {me.renewal && <p role="status" className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-success/40 bg-success-soft p-3 text-sm text-success"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />Renewed. Your next period starts {date(me.renewal.start_date)} and runs until {date(me.renewal.expiry_date)}.</p>}
          {!me.is_member && <div className="mt-4 space-y-2"><p className="text-sm text-text-secondary">Members register for every SSA event and get member prices on merch.</p><Button className="w-full" onClick={() => setJoining(true)} icon={<BadgeCheck className="size-4" aria-hidden />}>{ms?.status === 'expired' ? 'Renew membership' : 'Become a member'}</Button></div>}

          {me.member && (<>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="t-label">Student ID</dt><dd className="mt-0.5 font-mono">{me.member.student_id}</dd></div>
              <div><dt className="t-label">{me.is_member ? 'Member until' : ms?.status === 'expired' ? 'Expired' : 'Expiry'}</dt><dd className="mt-0.5">{me.membership_expires ? date(me.membership_expires) : ms?.status === 'expired' && ms?.expiry_date ? date(ms.expiry_date) : '—'}{me.is_member && me.days_left != null && <span className="block t-caption">{me.days_left} day{me.days_left === 1 ? '' : 's'} left</span>}</dd></div>
            </dl>
            {me.is_member && (qr ? <figure className="mt-5 text-center"><img src={qr} alt="Your membership QR code" width={240} height={240} className="mx-auto w-60 max-w-full rounded-[var(--radius-md)] bg-cream p-2" /><figcaption className="t-caption mt-2 inline-flex items-center gap-1"><QrCode className="size-3" aria-hidden />Show this at events to verify membership.</figcaption></figure> : /* Same footprint as the loaded QR + caption, so nothing shifts when it arrives. */
              <div className="mt-5 text-center" aria-label="Loading QR"><div className="mx-auto size-60 max-w-full skeleton rounded-[var(--radius-md)]" /><div className="mx-auto mt-2 h-[1.15rem] w-52 skeleton" /></div>)}
          </>)}

          {offer.data && (
            <div className="mt-5 border-t border-border pt-4">
              <h3 className="t-label">{me.is_member ? 'Your benefits' : `What membership includes · ${money(offer.data.price)}`}</h3>
              <ul className="mt-2 space-y-1.5 text-sm" aria-label="Membership benefits">
                {offer.data.benefits.map((b) => <li key={b} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{b}</li>)}
              </ul>
            </div>
          )}

          {me.dues.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <h3 className="t-label">Dues</h3>
              <ul className="mt-2 divide-y divide-border text-sm" aria-label="Membership dues">
                {me.dues.map((d) => (
                  <li key={d.membership_id} className="flex items-start justify-between gap-3 py-2">
                    <span className="min-w-0"><span className="block">{date(d.start_date)} – {date(d.expiry_date)}</span><span className="t-caption">{d.paid ? `Paid ${d.method === 'cash' ? 'in cash' : 'online'}${d.paid_at ? ` on ${date(d.paid_at)}` : ''}` : 'Not paid'}</span></span>
                    <span className="shrink-0 text-right"><span className="block t-num font-medium">{d.amount != null ? money(d.amount) : '—'}</span><StatusBadge status={d.paid ? 'paid' : 'pending'} /></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <section className="lg:col-span-2" aria-labelledby="tk-h">
          <SectionHeader title={<span id="tk-h">My tickets</span>} meta={`${me.tickets.length}`} actions={<Link to="/events" className="t-label inline-flex min-h-11 items-center hover:text-accent-text">Browse events →</Link>} />
          <DataTable rows={me.tickets} rowKey={(t) => t.id} caption="Your tickets" empty={<EmptyState icon={<Ticket className="size-5" aria-hidden />} title="No tickets yet" action={<Link to="/events" className="btn-secondary">Browse events</Link>} />}
            columns={[
              { key: 'event', header: 'Event', mobile: 'primary', render: (t) => <span className="font-medium">{t.event_title}</span> },
              { key: 'when', header: 'When', render: (t) => datetime(t.starts_at) },
              { key: 'type', header: 'Type', render: (t) => <span className="capitalize">{t.ticket_type.replace('_', ' ')}</span>, hideOnMobile: true },
              { key: 'price', header: 'Price', render: (t) => <span className="t-num">{money(t.price)}</span>, align: 'right' },
              { key: 'status', header: 'Status', mobile: 'status', render: (t) => <StatusBadge status={t.status} /> },
              { key: 'qr', header: '', mobile: 'actions', render: (t) => t.status !== 'pending' && t.status !== 'cancelled' ? <Link to={`/tickets/${t.id}`} className="btn-secondary !px-3 !text-xs"><QrCode className="size-3.5" aria-hidden />QR<span className="sr-only"> ticket for {t.event_title}</span></Link> : null, align: 'right' },
            ]} />
        </section>
        <section className="lg:col-span-3" aria-labelledby="or-h">
          <SectionHeader title={<span id="or-h">My orders</span>} actions={<Link to="/shop" className="t-label inline-flex min-h-11 items-center hover:text-accent-text">Visit the shop →</Link>} />
          <DataTable rows={orders.data} loading={orders.isLoading} error={orders.error} onRetry={() => orders.refetch()} rowKey={(o) => o.id} caption="Your merchandise orders" empty={<EmptyState icon={<ShoppingBag className="size-5" aria-hidden />} title="No orders yet" action={<Link to="/shop" className="btn-secondary">Visit the shop</Link>} />}
            columns={[
              { key: 'id', header: 'Order', mobile: 'primary', render: (o) => <span className="font-mono">#{o.id}</span> },
              { key: 'items', header: 'Items', render: (o) => <span className="text-text-secondary">{o.items.map((i) => `${i.product} (${i.size}) × ${i.qty}`).join(', ')}</span> },
              { key: 'total', header: 'Total', render: (o) => <span className="t-num">{money(o.total)}</span>, align: 'right' },
              { key: 'status', header: 'Status', mobile: 'status', render: (o) => <StatusBadge status={o.status}>{o.status === 'paid' ? 'paid · ready to collect' : o.status === 'fulfilled' ? 'collected' : o.status === 'pending' ? 'awaiting payment' : undefined}</StatusBadge> },
              { key: 'placed', header: 'Placed', render: (o) => datetime(o.created_at), hideOnMobile: true },
            ]} />
        </section>
      </div>
      <MembershipCard open={joining} onClose={() => setJoining(false)} onPaid={joined} reason="Join SSA to register for events and get member prices." />
      <MembershipCard open={renewing} renew onClose={() => setRenewing(false)} onPaid={renewed} reason={me.membership_expires ? `Your next period starts the day after ${date(me.membership_expires)}.` : undefined} />
    </>
  );
}
