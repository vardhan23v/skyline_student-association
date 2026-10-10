import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Ticket, UserCheck, UserX, Wallet } from 'lucide-react';
import { get } from '@/api/client';
import type { EventRegistrationRow, EventReport } from '@/api/types';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { MetricCard } from '@/components/MetricCard';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState';
import { datetime, money } from '@/components/format';

/** Admin › Events › one event: sales, attendance and revenue, plus who registered. */
export function EventReportPage({ id }: { id: number }) {
  const q = useQuery({ queryKey: ['admin', 'events', id, 'report'], queryFn: () => get<EventReport>(`/admin/events/${id}/report`) });
  const regs = useQuery({ queryKey: ['admin', 'events', id, 'registrations'], queryFn: () => get<EventRegistrationRow[]>(`/admin/events/${id}/registrations`) });
  const back = <Link to="/admin?tab=events" className="t-label mb-3 inline-flex items-center gap-1 hover:text-accent-text"><ArrowLeft className="size-3" aria-hidden />All events</Link>;
  if (q.isLoading) return <>{back}<div className="card"><Skeleton rows={6} /></div></>;
  if (!q.data) return <>{back}<ErrorState error={q.error} onRetry={() => q.refetch()} /></>;
  const r = q.data;
  const attendance = r.sold ? Math.round((r.checked_in / r.sold) * 100) : 0;
  return (
    <>
      {back}
      <PageHeader eyebrow={<>{datetime(r.event.starts_at)}{r.event.venue && ` · ${r.event.venue}`}</>} script="report" title={r.event.title} actions={<StatusBadge status={r.event.status} />} />
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <MetricCard label="Registered" icon={Ticket} value={r.sold} hint={`${r.pending} awaiting payment`} />
        <MetricCard label="Checked in" icon={UserCheck} value={r.checked_in} hint={r.sold ? `${attendance}% attendance` : undefined} tone="accent" />
        <MetricCard label="No-shows" icon={UserX} value={r.no_show} hint={`${r.cancelled} cancelled`} tone={r.no_show ? 'warning' : 'default'} />
        <MetricCard label="Revenue" icon={Wallet} value={money(r.revenue)} hint={`spent ${money(r.spent)} · net ${money(r.revenue - r.spent)}`} />
      </div>
      <section className="mt-6">
        <SectionHeader title="Registrations" meta={regs.data ? `${regs.data.length}` : undefined} />
        <DataTable rows={regs.data} loading={regs.isLoading} error={regs.error} onRetry={() => regs.refetch()} rowKey={(t) => t.id} caption="Event registrations" empty={<EmptyState title="Nobody has registered yet" />}
          columns={[
            { key: 'who', header: 'Member', render: (t) => <><span className="font-medium">{t.user_name ?? t.holder_name}</span><span className="block t-caption">{t.holder_email}</span></> },
            { key: 'when', header: 'Registered', render: (t) => datetime(t.created_at), hideOnMobile: true },
            { key: 'price', header: 'Paid', render: (t) => <span className="t-num">{Number(t.price) === 0 ? 'Free' : money(t.price)}</span>, align: 'right' },
            { key: 'pay', header: 'Payment', render: (t) => <StatusBadge status={t.payment_status} />, hideOnMobile: true },
            { key: 'status', header: 'Ticket', render: (t) => <StatusBadge status={t.status} /> },
            { key: 'in', header: 'Checked in', render: (t) => (t.checked_in_at ? datetime(t.checked_in_at) : '—'), hideOnMobile: true },
          ]} />
      </section>
    </>
  );
}
