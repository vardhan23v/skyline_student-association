import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { get } from '@/api/client';
import type { Ticket } from '@/api/types';
import { Badge, ErrorBox, PageTitle, datetime, money } from '@/components/ui';

export function TicketPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['tickets', id], queryFn: () => get<Ticket>(`/tickets/${id}`) });
  if (q.isLoading) return <p>Loading…</p>;
  if (!q.data) return <ErrorBox error={q.error} />;
  const t = q.data;
  return (
    <div className="max-w-sm mx-auto">
      <PageTitle title={t.event_title ?? 'Ticket'} sub={`${datetime(t.starts_at)} · ${t.venue ?? ''}`} />
      <div className="card text-center">
        {t.qr_data_url ? <img src={t.qr_data_url} alt="Ticket QR" className="mx-auto" /> : <p className="text-slate-500">QR available once payment is confirmed.</p>}
        <p className="mt-3 font-medium">{t.holder_name}</p>
        <p className="text-sm text-slate-500">{t.ticket_type.replace('_', ' ')} · {money(t.price)}</p>
        <p className="mt-2"><Badge s={t.status} /></p>
        {t.checked_in_at && <p className="text-xs text-slate-500 mt-1">Checked in {datetime(t.checked_in_at)}</p>}
      </div>
    </div>
  );
}
