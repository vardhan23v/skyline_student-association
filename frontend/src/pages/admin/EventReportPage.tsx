import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Ticket, UserCheck, UserX, Wallet } from 'lucide-react';
import { get } from '@/api/client';
import type { EventRegistrationRow, EventReport } from '@/api/types';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { EventPhoto } from '@/components/EventPhoto';
import { MetricCard } from '@/components/MetricCard';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState';
import { datetime, money } from '@/components/format';

/** Admin › Events › one event: sales, attendance and revenue, plus who registered. */
export function EventReportPage({ id }: { id: number }) {
  const q = useQuery({ queryKey: ['admin', 'events', id, 'report'], queryFn: () => get<EventReport>(`/admin/events/${id}/report`) });
  const regs = useQuery({ queryKey: ['admin', 'events', id, 'registrations'], queryFn: () => get<EventRegistrationRow[]>(`/admin/events/${id}/registrations`) });
  const back = <Link to="/admin/events" className="t-label mb-2 inline-flex min-h-11 items-center gap-1 hover:text-accent-text"><ArrowLeft className="size-3" aria-hidden />All events</Link>;
  if (q.isLoading) return <>{back}<div className="card"><Skeleton rows={6} /></div></>;
  if (!q.data) return <>{back}<ErrorState error={q.error} onRetry={() => q.refetch()} /></>;
  const r = q.data;
  const attendance = r.sold ? Math.round((r.checked_in / r.sold) * 100) : 0;
  return (
    <>
      {back}
      <PageHeader eyebrow={<>{datetime(r.event.starts_at)}{r.event.venue && ` · ${r.event.venue}`}</>} script="report" title={r.event.title} actions={<StatusBadge status={r.event.status} />} />
      {/* Change it from Events → Edit (photo URL and alt text). */}
      <EventPhoto event={r.event} className="mb-5 aspect-[21/9] max-h-64 w-full rounded-[var(--radius-lg)] border border-border" sizes="(min-width: 1024px) 900px, 100vw" />
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <MetricCard label="Registered" icon={Ticket} value={r.sold} hint={`${r.pending} awaiting payment`} />
        <MetricCard label="Checked in" icon={UserCheck} value={r.checked_in} hint={r.sold ? `${attendance}% attendance` : undefined} tone="accent" />
        <MetricCard label="No-shows" icon={UserX} value={r.no_show} hint={`${r.cancelled} cancelled`} tone={r.no_show ? 'warning' : 'default'} />
        <MetricCard label="Revenue" icon={Wallet} value={money(r.revenue)} hint={`spent ${money(r.spent)} · net ${money(r.revenue - r.spent)}`} />
      </div>
      <section className="mt-6" aria-labelledby="split-h">
        <SectionHeader title={<span id="split-h">Members vs non-members</span>} meta={r.event.members_only ? 'members only' : undefined} />
        <DataTable rows={(['member', 'non_member'] as const).map((k) => ({ key: k, label: k === 'member' ? 'Members' : 'Non-members', price: k === 'member' ? r.event.member_price : r.event.non_member_price, ...r.split[k] }))} rowKey={(x) => x.key} caption="Attendance and revenue by ticket type"
          columns={[
            { key: 'type', header: 'Ticket', mobile: 'primary', render: (x) => <><span className="font-medium">{x.label}</span><span className="block t-caption t-num">{Number(x.price) === 0 ? 'Free' : money(x.price)} each</span></> },
            { key: 'sold', header: 'Registered', align: 'right', render: (x) => <span className="t-num">{x.sold}</span> },
            { key: 'in', header: 'Checked in', align: 'right', render: (x) => <span className="t-num">{x.checked_in}{x.sold ? <span className="t-caption"> · {Math.round((x.checked_in / x.sold) * 100)}%</span> : null}</span> },
            { key: 'rev', header: 'Ticket revenue', align: 'right', render: (x) => <span className="t-num font-medium">{money(x.revenue)}</span> },
          ]} />
      </section>
      <section className="mt-6">
        <SectionHeader title="Registrations" meta={regs.data ? `${regs.data.length}` : undefined} />
        <DataTable rows={regs.data} loading={regs.isLoading} error={regs.error} onRetry={() => regs.refetch()} rowKey={(t) => t.id} caption="Event registrations" empty={<EmptyState title="Nobody has registered yet" />}
          columns={[
            { key: 'who', header: 'Member', mobile: 'primary', render: (t) => <><span className="font-medium">{t.user_name ?? t.holder_name}</span><span className="block t-caption">{t.holder_email}</span></> },
            { key: 'when', header: 'Registered', render: (t) => datetime(t.created_at), hideOnMobile: true },
            { key: 'type', header: 'Type', render: (t) => <span className="capitalize">{t.ticket_type.replace('_', '-')}</span>, hideOnMobile: true },
            { key: 'price', header: 'Paid', render: (t) => <span className="t-num">{Number(t.price) === 0 ? 'Free' : money(t.price)}</span>, align: 'right' },
            { key: 'pay', header: 'Payment', render: (t) => <StatusBadge status={t.payment_status} />, hideOnMobile: true },
            { key: 'status', header: 'Ticket', mobile: 'status', render: (t) => <StatusBadge status={t.status} /> },
            { key: 'in', header: 'Checked in', render: (t) => (t.checked_in_at ? datetime(t.checked_in_at) : '—'), hideOnMobile: true },
          ]} />
      </section>
    </>
  );
}
