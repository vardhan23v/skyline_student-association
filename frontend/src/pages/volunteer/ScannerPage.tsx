import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, CheckCircle2, XCircle } from 'lucide-react';
import { get } from '@/api/client';
import { getToken } from '@/auth/token';
import type { Event } from '@/api/types';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Input, LabeledSelect } from '@/components/Input';

type Result = { ok: boolean; reason?: string; ticket?: { holder_name: string; ticket_type: string; status: string }; membership_active?: boolean };

/**
 * Door check-in, built for one hand on a phone at a busy door: giant result panel,
 * event lock, camera toggle, manual token fallback, and a recent-scans log.
 * The API answers 409 with a JSON body for rejected scans, so we read the body directly.
 */
export function ScannerPage() {
  const events = useQuery({ queryKey: ['events'], queryFn: () => get<Event[]>('/events') });
  const [eventId, setEventId] = useState<number | ''>('');
  const [manual, setManual] = useState('');
  const [last, setLast] = useState<Result | null>(null);
  const [busyState, setBusyState] = useState(false);
  const [log, setLog] = useState<(Result & { at: string })[]>([]);
  const [camera, setCamera] = useState(false);
  const scanner = useRef<Html5Qrcode | null>(null);
  const busy = useRef(false);

  const submit = async (token: string) => {
    if (!token || busy.current) return; busy.current = true; setBusyState(true);
    try {
      const res = await fetch('/api/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ qr_token: token, event_id: eventId || undefined }) });
      const r = (await res.json()) as Result;
      if (navigator.vibrate) navigator.vibrate(r.ok ? 40 : [60, 40, 60]);
      setLast(r); setLog((l) => [{ ...r, at: new Date().toLocaleTimeString() }, ...l].slice(0, 20));
    } catch (e) { setLast({ ok: false, reason: 'Network error. Try again.' }); }
    finally { setBusyState(false); setTimeout(() => (busy.current = false), 1200); }
  };
  useEffect(() => {
    if (!camera) { scanner.current?.stop().catch(() => {}); scanner.current = null; return; }
    const s = new Html5Qrcode('reader'); scanner.current = s;
    s.start({ facingMode: 'environment' }, { fps: 8, qrbox: 220 }, (text) => submit(text), () => {}).catch((e) => { setLast({ ok: false, reason: `Camera unavailable: ${e}` }); setCamera(false); });
    return () => { s.stop().catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, eventId]);

  const live = events.data?.filter((e) => e.status !== 'draft') ?? [];
  return (
    <>
      <PageHeader eyebrow="Check-in" title="Door scanner" description="Pick the event, then scan. Each QR works exactly once." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="card space-y-3">
            <LabeledSelect label="Event" value={eventId} onChange={(e) => setEventId(e.target.value ? Number(e.target.value) : '')} hint={!eventId ? 'Locking to an event rejects tickets for other events.' : undefined}>
              <option value="">Any event (not recommended)</option>{live.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </LabeledSelect>
            <Button variant={camera ? 'danger' : 'primary'} className="w-full !min-h-12" onClick={() => setCamera(!camera)} icon={camera ? <CameraOff className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />}>{camera ? 'Stop camera' : 'Start camera'}</Button>
            <div id="reader" className={`overflow-hidden rounded-[var(--radius-md)] bg-black ${camera ? 'min-h-56 pulse-ring' : ''}`} aria-live="off" />
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(manual.trim()); setManual(''); }}>
              <label htmlFor="manual" className="sr-only">QR token</label>
              <Input id="manual" placeholder="…or paste a QR token" value={manual} onChange={(e) => setManual(e.target.value)} autoComplete="off" />
              <Button type="submit" variant="secondary" loading={busyState}>Check</Button>
            </form>
          </div>
        </div>
        <div className="space-y-3">
          <div role="status" aria-live="assertive" aria-atomic="true" className={`flex min-h-56 flex-col items-center justify-center rounded-[var(--radius-xl)] border p-6 text-center transition-colors ${!last ? 'card-sunken text-text-tertiary' : last.ok ? 'border-success/50 bg-success-soft text-success' : 'border-danger/50 bg-danger-soft text-danger'}`} style={{ transitionDuration: 'var(--dur-base)' }}>
            {!last ? <><Camera className="size-8" aria-hidden /><p className="mt-2 text-sm">Waiting for the first scan</p></> : (<>
              {last.ok ? <CheckCircle2 className="size-14" aria-hidden /> : <XCircle className="size-14" aria-hidden />}
              <p className="mt-3 font-display text-2xl font-medium leading-tight text-text-primary">{last.ok ? 'Admit' : 'Stop'}</p>
              <p className="mt-1 text-lg">{last.ok ? last.ticket?.holder_name : last.reason}</p>
              {last.ticket && <p className="mt-1 text-sm opacity-90 capitalize">{!last.ok && `${last.ticket.holder_name} · `}{last.ticket.ticket_type.replace('_', ' ')}{last.ok && (last.membership_active ? ' · active member' : ' · non-member')}</p>}
            </>)}
          </div>
          <div className="card">
            <SectionHeader title="Recent scans" meta={`${log.length}`} as="h3" />
            {log.length === 0 ? <p className="t-caption">Nothing scanned yet.</p> : (
              <ol className="divide-y divide-border text-sm">{log.map((r, i) => <li key={i} className="flex items-center gap-2 py-2"><span className={`font-mono text-xs ${r.ok ? 'text-success' : 'text-danger'}`}>{r.at}</span>{r.ok ? <CheckCircle2 className="size-3.5 text-success" aria-hidden /> : <XCircle className="size-3.5 text-danger" aria-hidden />}<span className="truncate">{r.ticket?.holder_name ?? ''}{r.reason ? <span className="text-text-secondary"> {r.reason}</span> : null}</span></li>)}</ol>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
