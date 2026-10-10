import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { get } from '@/api/client';
import type { EventReport } from '@/api/types';
import { ErrorBox, PageTitle, Stat, datetime, money } from '@/components/ui';

export function EventReportPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['events', id, 'report'], queryFn: () => get<EventReport>(`/events/${id}/report`) });
  if (q.isLoading) return <p>Loading…</p>;
  if (!q.data) return <ErrorBox error={q.error} />;
  const r = q.data;
  return (
    <>
      <PageTitle title={`${r.event.title} — report`} sub={`${datetime(r.event.starts_at)} · ${r.event.venue ?? ''}`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Stat label="Sold" value={r.sold} hint={`${r.by_type.member} member · ${r.by_type.non_member} non-member`} />
        <Stat label="Checked in" value={r.checked_in} hint={r.sold ? `${Math.round((r.checked_in / r.sold) * 100)}% attendance` : undefined} />
        <Stat label="No-shows" value={r.no_show} hint={`${r.pending} pending · ${r.cancelled} cancelled`} />
        <Stat label="Revenue" value={money(r.revenue)} hint={`spent ${money(r.spent)} · net ${money(r.revenue - r.spent)}`} />
      </div>
      <div className="card"><h3 className="font-semibold mb-2">Breakdown</h3><table className="table"><thead><tr><th>Type</th><th>Status</th><th>Count</th></tr></thead><tbody>{(r as any).breakdown.map((b: any, i: number) => <tr key={i}><td>{b.ticket_type.replace('_', ' ')}</td><td>{b.status.replace('_', ' ')}</td><td>{b.n}</td></tr>)}</tbody></table></div>
    </>
  );
}
