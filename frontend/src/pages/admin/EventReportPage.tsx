import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Ticket, UserCheck, UserX, Wallet } from 'lucide-react';
import { get } from '@/api/client';
import type { EventReport } from '@/api/types';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { MetricCard } from '@/components/MetricCard';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState, Skeleton } from '@/components/EmptyState';
import { datetime, money } from '@/components/format';

export function EventReportPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['events', id, 'report'], queryFn: () => get<EventReport>(`/events/${id}/report`) });
  if (q.isLoading) return <div className="card"><Skeleton rows={6} /></div>;
  if (!q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data;
  const attendance = r.sold ? Math.round((r.checked_in / r.sold) * 100) : 0;
  return (
    <>
      <Link to="/admin/events" className="t-label mb-3 inline-flex items-center gap-1 hover:text-accent"><ArrowLeft className="size-3" aria-hidden />Events</Link>
      <PageHeader eyebrow={<>{datetime(r.event.starts_at)}{r.event.venue && ` · ${r.event.venue}`}</>} title={`${r.event.title} — report`} actions={<StatusBadge status={r.event.status} />} />
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <MetricCard label="Sold" icon={Ticket} value={r.sold} hint={`${r.by_type.member} member · ${r.by_type.non_member} non-member`} />
        <MetricCard label="Checked in" icon={UserCheck} value={r.checked_in} hint={r.sold ? `${attendance}% attendance` : undefined} tone="accent" />
        <MetricCard label="No-shows" icon={UserX} value={r.no_show} hint={`${r.pending} pending · ${r.cancelled} cancelled`} tone={r.no_show ? 'warning' : 'default'} />
        <MetricCard label="Revenue" icon={Wallet} value={money(r.revenue)} hint={`spent ${money(r.spent)} · net ${money(r.revenue - r.spent)}`} />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="card">
          <SectionHeader title="Attendance" meta={`${attendance}%`} />
          <div className="h-3 overflow-hidden rounded-full bg-surface-elevated" role="progressbar" aria-valuenow={attendance} aria-valuemin={0} aria-valuemax={100} aria-label="Attendance rate"><div className="h-full rounded-full bg-accent" style={{ width: `${attendance}%` }} /></div>
          <p className="t-caption mt-2">{r.checked_in} of {r.sold} ticket holders scanned in at the door.</p>
        </section>
        <section className="card">
          <SectionHeader title="Breakdown" />
          <table className="table"><thead><tr><th scope="col">Type</th><th scope="col">Status</th><th scope="col" className="text-right">Count</th></tr></thead><tbody>
            {(r as any).breakdown.map((b: any, i: number) => <tr key={i}><td className="capitalize">{b.ticket_type.replace('_', ' ')}</td><td><StatusBadge status={b.status} /></td><td className="text-right t-num">{b.n}</td></tr>)}
          </tbody></table>
        </section>
      </div>
    </>
  );
}
