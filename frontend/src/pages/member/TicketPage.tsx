import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CalendarPlus, ExternalLink, MapPin, Sun } from 'lucide-react';
import { get } from '@/api/client';
import { getToken } from '@/auth/token';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import type { Ticket } from '@/api/types';
import { StatusBadge } from '@/components/StatusBadge';
import { SectionHeading } from '@/components/landing/SectionHeading';
import { ErrorState, Skeleton } from '@/components/EmptyState';
import { datetime, money } from '@/components/format';

type WakeLock = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLock> } };

/** Keep the screen on while `on` (the QR is showing): phones dim and lock mid-queue otherwise. The lock drops when
 *  the tab is hidden, so it is re-taken on return. Unsupported browsers just carry on. */
function useWakeLock(on: boolean) {
  useEffect(() => {
    const wl = (navigator as WakeLockNavigator).wakeLock;
    if (!on || !wl) return;
    let lock: WakeLock | null = null, alive = true;
    const take = () => { if (document.visibilityState === 'visible') wl.request('screen').then((l) => { if (alive) lock = l; else void l.release(); }, () => {}); };
    take();
    document.addEventListener('visibilitychange', take);
    return () => { alive = false; document.removeEventListener('visibilitychange', take); void lock?.release().catch(() => {}); };
  }, [on]);
}

/** Events have no end time; calendars get a 2-hour slot (the same as the .ics). */
const EVENT_HOURS = 2;
const gcalDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** A Google Calendar "add event" link from the ticket's event fields. */
function googleCalendarUrl(t: Ticket) {
  const start = new Date(t.starts_at!), end = new Date(start.getTime() + EVENT_HOURS * 3600_000);
  const p = new URLSearchParams({ action: 'TEMPLATE', text: t.event_title ?? 'SSA event', dates: `${gcalDate(start)}/${gcalDate(end)}`, details: `Your ticket: ${window.location.origin}/tickets/${t.id}`, ...(t.venue ? { location: t.venue } : {}) });
  return `https://calendar.google.com/calendar/render?${p}`;
}

/** Download the ticket's .ics. It needs the Authorization header, so it's fetched and handed over as a blob. */
async function downloadIcs(id: number) {
  const res = await fetch(`/api/tickets/${id}/calendar.ics`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'Could not create the calendar file');
  const url = URL.createObjectURL(new Blob([await res.text()], { type: 'text/calendar' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `ssa-ticket-${id}.ics` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Wallet-style ticket: QR on cream (dark on light scans reliably), perforated divider, holder details. */
export function TicketPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['tickets', id], queryFn: () => get<Ticket>(`/tickets/${id}`) });
  useWakeLock(!!q.data?.qr_data_url);
  if (q.isLoading) return <div className="card mx-auto max-w-sm"><Skeleton rows={6} /></div>;
  if (!q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const t = q.data;
  const upcoming = !!t.starts_at && +new Date(t.starts_at) > Date.now() && t.status !== 'cancelled';
  return (
    <div className="mx-auto max-w-sm">
      <Link to="/me" className="t-label mb-1 flex min-h-11 w-fit items-center gap-1 hover:text-accent-text"><ArrowLeft className="size-3" aria-hidden />My account</Link>
      <SectionHeading as="h1" size="md" script="your" title="Ticket" className="mb-6" />
      <article className="card glow-horizon overflow-hidden !p-0" aria-label={`Ticket for ${t.event_title}`}>
        <div className="p-5 sm:p-6">
          <div className="t-label mb-1">Skyline Student Association</div>
          <h2 className="t-h3 text-cream">{t.event_title ?? 'Ticket'}</h2>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 t-caption"><span className="inline-flex items-center gap-1"><CalendarDays className="size-3" aria-hidden />{datetime(t.starts_at)}</span>{t.venue && <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{t.venue}</span>}</p>
        </div>
        <div className="relative border-y border-dashed border-border-strong"><span className="absolute -left-3 -top-3 size-6 rounded-full bg-midnight" aria-hidden /><span className="absolute -right-3 -top-3 size-6 rounded-full bg-midnight" aria-hidden /></div>
        <div className="flex flex-col items-center p-5 text-center sm:p-6">
          {/* At least 240px of code (plus the quiet zone) on cream, so door scanners read it at arm's length. */}
          {t.qr_data_url ? (<>
            <img src={t.qr_data_url} alt="Ticket QR code. Show at the door." width={272} height={272} className="w-[17rem] max-w-full rounded-[var(--radius-md)] bg-cream p-3 [image-rendering:pixelated]" />
            <p className="t-caption mt-3 inline-flex items-center gap-1.5"><Sun className="size-3.5 shrink-0" aria-hidden />Brightness tip: turn screen brightness up.</p>
          </>) : <div className="card-sunken flex size-60 items-center justify-center p-6 t-caption">{t.status === 'cancelled' ? 'This ticket was cancelled, so no QR was issued.' : 'QR available once payment is confirmed.'}</div>}
          <p className="mt-4 text-lg font-medium">{t.holder_name}</p>
          <p className="t-caption capitalize">{t.ticket_type.replace('_', ' ')} · {money(t.price)}</p>
          <div className="mt-3"><StatusBadge status={t.status} /></div>
          {t.checked_in_at && <p className="t-caption mt-2">Checked in {datetime(t.checked_in_at)}</p>}
        </div>
      </article>
      {upcoming && <CalendarButtons t={t} />}
    </div>
  );
}

function CalendarButtons({ t }: { t: Ticket }) {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  const ics = async () => { setBusy(true); try { await downloadIcs(t.id); } catch (e) { toast.error('Add to calendar failed', (e as Error).message); } finally { setBusy(false); } };
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <Button variant="secondary" className="w-full" loading={busy} onClick={ics} icon={<CalendarPlus className="size-4" aria-hidden />}>Add to calendar</Button>
      <a href={googleCalendarUrl(t)} target="_blank" rel="noreferrer" className="btn-secondary w-full"><ExternalLink className="size-4" aria-hidden />Google Calendar</a>
    </div>
  );
}
