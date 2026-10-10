import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, MapPin } from 'lucide-react';
import { get } from '@/api/client';
import type { Ticket } from '@/api/types';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorState, Skeleton } from '@/components/EmptyState';
import { datetime, money } from '@/components/format';

/** Wallet-style ticket: QR on a dark sunken panel, perforated divider, holder details. */
export function TicketPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['tickets', id], queryFn: () => get<Ticket>(`/tickets/${id}`) });
  if (q.isLoading) return <div className="card mx-auto max-w-sm"><Skeleton rows={6} /></div>;
  if (!q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const t = q.data;
  return (
    <div className="mx-auto max-w-sm">
      <Link to="/me" className="t-label mb-3 inline-flex items-center gap-1 hover:text-accent"><ArrowLeft className="size-3" aria-hidden />My account</Link>
      <article className="card glow-horizon overflow-hidden !p-0" aria-label={`Ticket for ${t.event_title}`}>
        <div className="p-6">
          <div className="t-label mb-1">Skyline Student Association</div>
          <h1 className="t-title">{t.event_title ?? 'Ticket'}</h1>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 t-caption"><span className="inline-flex items-center gap-1"><CalendarDays className="size-3" aria-hidden />{datetime(t.starts_at)}</span>{t.venue && <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{t.venue}</span>}</p>
        </div>
        <div className="relative border-y border-dashed border-border-strong"><span className="absolute -left-3 -top-3 size-6 rounded-full bg-background" aria-hidden /><span className="absolute -right-3 -top-3 size-6 rounded-full bg-background" aria-hidden /></div>
        <div className="flex flex-col items-center p-6 text-center">
          {t.qr_data_url ? <img src={t.qr_data_url} alt="Ticket QR code. Show at the door." width={224} height={224} className="rounded-[var(--radius-md)] bg-white p-2" /> : <div className="card-sunken flex size-56 items-center justify-center p-6 t-caption">{t.status === 'cancelled' ? 'This ticket was cancelled, so no QR was issued.' : 'QR available once payment is confirmed.'}</div>}
          <p className="mt-4 text-lg font-medium">{t.holder_name}</p>
          <p className="t-caption capitalize">{t.ticket_type.replace('_', ' ')} · {money(t.price)}</p>
          <div className="mt-3"><StatusBadge status={t.status} /></div>
          {t.checked_in_at && <p className="t-caption mt-2">Checked in {datetime(t.checked_in_at)}</p>}
        </div>
      </article>
    </div>
  );
}
