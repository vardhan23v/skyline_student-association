import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, CheckCircle2, ScanLine, UserCheck, XCircle } from 'lucide-react';
import { get } from '@/api/client';
import { getToken } from '@/auth/token';
import type { Event, EventReport } from '@/api/types';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { Input, LabeledSelect } from '@/components/Input';
import { ErrorState } from '@/components/EmptyState';

type Result = { ok: boolean; reason?: string; ticket?: { holder_name: string; ticket_type: string; status: string }; membership_active?: boolean };

/** The camera decodes ~8 frames/s, so a code held in view is read many times; ignore repeats of it for this long. */
const SAME_CODE_MS = 4000;

/** html5-qrcode's stop() *throws synchronously* unless it is scanning (e.g. after a denied permission or mid-start). */
function safeStop(s: Html5Qrcode) {
  try { s.stop().catch(() => {}); } catch { /* not running */ }
}

function cameraError(e: unknown) {
  const s = String(e);
  if (/NotAllowedError|Permission|denied/i.test(s)) return 'Camera access was blocked. Allow the camera for this site in the browser settings, or paste the token below.';
  if (/NotFoundError|OverconstrainedError|device not found/i.test(s)) return 'No usable camera was found on this device. Paste the token below instead.';
  if (/NotReadableError|Could not start video/i.test(s)) return 'The camera is busy in another app. Close it and try again.';
  if (/not supported|secure/i.test(s)) return 'This browser cannot use the camera here (it needs https). Paste the token below instead.';
  return `Camera unavailable: ${s}`;
}

/** Show the server's "Already used at <ISO>" in the volunteer's local time. */
const localTimes = (reason?: string) => reason?.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, (iso) => new Date(iso).toLocaleTimeString());

/**
 * Door check-in, built for one hand on a phone at a busy door: live attendance at the top, a square rear-camera view
 * that pauses on each read and shows the result over the picture (✓/✗, name, a buzz), "Scan next" at the bottom of
 * the screen, the event lock, a manual token fallback, and a recent-scans log.
 * The API answers 409 with a JSON body for rejected scans, so we read the body directly.
 */
export function ScannerPage() {
  const qc = useQueryClient();
  const events = useQuery({ queryKey: ['admin', 'events'], queryFn: () => get<Event[]>('/admin/events') });
  const [eventId, setEventId] = useState<number | ''>('');
  const report = useQuery({ queryKey: ['admin', 'events', eventId, 'report'], queryFn: () => get<EventReport>(`/admin/events/${eventId}/report`), enabled: !!eventId, refetchInterval: 15_000 });
  const scanner = useRef<Html5Qrcode | null>(null);
  const [paused, setPaused] = useState(false);
  const [manual, setManual] = useState('');
  const [last, setLast] = useState<Result | null>(null);
  const [busyState, setBusyState] = useState(false);
  const [log, setLog] = useState<(Result & { at: string; id: number })[]>([]);
  const [camera, setCamera] = useState(false);
  const [camErr, setCamErr] = useState<string | null>(null);
  const inFlight = useRef(false);
  const lastRead = useRef<{ token: string; at: number } | null>(null);
  const eventRef = useRef<number | ''>('');
  const seq = useRef(0);

  // The camera callback is bound once per start; read the event lock through a ref instead of restarting the camera.
  useEffect(() => { eventRef.current = eventId; lastRead.current = null; }, [eventId]);

  const submit = async (token: string, fromCamera = false) => {
    if (!token) return;
    const now = Date.now(), prev = lastRead.current;
    // Without this, an admitted ticket still in frame is re-sent and flips to "Already used" a moment later.
    if (fromCamera && prev?.token === token && now - prev.at < SAME_CODE_MS) { prev.at = now; return; }
    if (inFlight.current) return;
    if (fromCamera) lastRead.current = { token, at: now };
    inFlight.current = true; setBusyState(true);
    let r: Result;
    try {
      const res = await fetch('/api/admin/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ qr_token: token, event_id: eventRef.current || undefined }) });
      const body = await res.json().catch(() => null);
      // 200 and 409 carry a check-in result; anything else (401/403/429/400) is an error envelope or plain text.
      if ((res.ok || res.status === 409) && body && typeof body.ok === 'boolean') r = { ...body, reason: localTimes(body.reason) };
      else r = { ok: false, reason: res.status === 401 ? 'Session expired. Sign in again.' : res.status === 429 ? 'Too many scans. Wait a few seconds.' : res.status === 400 ? 'Not a ticket QR code.' : body?.error || `Check-in failed (${res.status}).` };
    } catch {
      r = { ok: false, reason: 'Network error. Try again.' };
      lastRead.current = null; // let the camera retry the same code
    } finally { inFlight.current = false; setBusyState(false); }
    if (navigator.vibrate) navigator.vibrate(r.ok ? 40 : [60, 40, 60]);
    const entry = { ...r, at: new Date().toLocaleTimeString(), id: ++seq.current };
    setLast(r); setLog((l) => [entry, ...l].slice(0, 20));
    if (r.ok && eventRef.current) qc.invalidateQueries({ queryKey: ['admin', 'events', eventRef.current, 'report'] });
  };
  /** Clear the result and start reading again (the camera paused on the last code). */
  const scanNext = () => {
    setLast(null); lastRead.current = null;
    if (scanner.current && paused) { try { scanner.current.resume(); } catch { /* not paused */ } setPaused(false); }
  };
  const submitRef = useRef(submit);
  useEffect(() => { submitRef.current = submit; });

  // Camera lifecycle: release it on stop/unmount even if start() is still pending (permission prompt open).
  useEffect(() => {
    if (!camera) return;
    let cancelled = false;
    const s = new Html5Qrcode('reader');
    scanner.current = s;
    // Rear camera, square frame, scan box 70% of the shorter side. Each read pauses the feed until "Scan next".
    const qrbox = (w: number, h: number) => { const n = Math.floor(Math.min(w, h) * 0.7); return { width: n, height: n }; };
    s.start({ facingMode: 'environment' }, { fps: 8, qrbox, aspectRatio: 1 }, (text) => {
      if (cancelled) return;
      try { s.pause(true); setPaused(true); } catch { /* already paused */ }
      void submitRef.current(text.trim(), true);
    }, () => {})
      .then(() => { if (cancelled) safeStop(s); })
      .catch((e) => { if (!cancelled) { setCamErr(cameraError(e)); setCamera(false); } });
    return () => { cancelled = true; scanner.current = null; setPaused(false); safeStop(s); };
  }, [camera]);

  const live = events.data?.filter((e) => e.status !== 'draft') ?? [];
  const r = report.data;
  const banner = (
    <div role="status" aria-live="assertive" aria-atomic="true" className={`flex flex-col items-center justify-center rounded-[var(--radius-xl)] border p-5 text-center transition-colors ${!last ? 'card-sunken min-h-40 text-text-tertiary lg:min-h-56' : last.ok ? 'border-success/50 bg-success-soft text-success' : 'border-danger/50 bg-danger-soft text-danger'} ${last && camera ? 'absolute inset-0 z-10 !bg-midnight/90 backdrop-blur-sm' : 'min-h-40'}`} style={{ transitionDuration: 'var(--dur-base)' }}>
      {!last ? <><Camera className="size-8" aria-hidden /><p className="mt-2 text-sm">Waiting for the first scan</p></> : (<>
        {last.ok ? <CheckCircle2 className="size-16" aria-hidden /> : <XCircle className="size-16" aria-hidden />}
        <p className="mt-3 font-display text-3xl font-bold uppercase leading-tight tracking-wide text-text-primary">{last.ok ? 'Admit' : 'Stop'}</p>
        <p className="mt-1 text-xl">{last.ok ? last.ticket?.holder_name : last.reason}</p>
        {last.ticket && <p className="mt-1 text-sm opacity-90 capitalize">{!last.ok && `${last.ticket.holder_name} · `}{last.ticket.ticket_type.replace('_', ' ')}{last.ok && (last.membership_active ? ' · active member' : ' · non-member')}</p>}
      </>)}
    </div>
  );
  return (
    <>
      <PageHeader eyebrow="Check-in" script="door" title="Scanner" description="Pick the event, then scan. Each QR works exactly once." className="!mb-4 md:!mb-8" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="card space-y-3 !p-4 sm:!p-5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
              <LabeledSelect label="Event" value={eventId} onChange={(e) => setEventId(e.target.value ? Number(e.target.value) : '')} hint={!eventId ? 'Locking to an event rejects tickets for other events.' : undefined}>
                <option value="">Any event (not recommended)</option>{live.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </LabeledSelect>
              {/* Live attendance: always in the first screenful. */}
              <div className={`card-sunken flex min-h-12 flex-col justify-center px-3 text-right ${eventId ? '' : 'self-start mt-6'}`} aria-live="polite">
                <span className="t-label inline-flex items-center justify-end gap-1"><UserCheck className="size-3" aria-hidden />In</span>
                <span className="t-num font-display text-lg font-bold leading-none">{eventId && r ? <>{r.checked_in}<span className="text-sm font-medium text-text-tertiary">/{r.sold}</span></> : '—'}</span>
              </div>
            </div>
            <Button variant={camera ? 'danger' : 'primary'} className="w-full !min-h-12" onClick={() => { setCamErr(null); setCamera((c) => !c); }} icon={camera ? <CameraOff className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />}>{camera ? 'Stop camera' : 'Start camera'}</Button>
            <ErrorState error={camErr ? new Error(camErr) : null} />
            {/* Square, full width (capped in landscape so the result and controls stay on screen). */}
            <div className={`relative mx-auto w-full ${camera ? 'max-w-[min(100%,70svh)]' : ''}`}>
              <div id="reader" data-cursor="text" className={`overflow-hidden rounded-[var(--radius-md)] bg-midnight ${camera ? 'aspect-square pulse-ring [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover' : ''}`} aria-live="off" />
              {camera && last ? banner : null}
            </div>
            {!(camera && last) && banner}
            {last && <Button className="hidden w-full !min-h-12 lg:inline-flex" onClick={scanNext} icon={<ScanLine className="size-4" aria-hidden />}>Scan next</Button>}
          </div>
          {/* Keep the typed token if a check is already running, instead of silently discarding it. */}
          <form className="card flex gap-2 !p-3" onSubmit={(e) => { e.preventDefault(); const t = manual.trim(); if (!t || inFlight.current) return; setManual(''); void submit(t); }}>
            <label htmlFor="manual" className="sr-only">QR token</label>
            <Input id="manual" placeholder="…or paste a QR token" value={manual} onChange={(e) => setManual(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="go" />
            <Button type="submit" variant="secondary" loading={busyState} className="shrink-0">Check</Button>
          </form>
        </div>
        <div className="card self-start">
          <SectionHeader title="Recent scans" meta={`${log.length}`} as="h3" />
          {log.length === 0 ? <p className="t-caption">Nothing scanned yet.</p> : (
            <ol className="divide-y divide-border text-sm">{log.map((x) => <li key={x.id} className="flex items-center gap-2 py-2"><span className={`font-mono text-xs ${x.ok ? 'text-success' : 'text-danger'}`}>{x.at}</span>{x.ok ? <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden /> : <XCircle className="size-3.5 shrink-0 text-danger" aria-hidden />}<span className="truncate">{x.ticket?.holder_name ?? ''}{x.reason ? <span className="text-text-secondary"> {x.reason}</span> : null}</span></li>)}</ol>
          )}
        </div>
      </div>
      {/* Phones and tablets: "Scan next" pinned at the bottom, in thumb reach, after every result. */}
      {last && <>
        <div className="h-24 lg:hidden" aria-hidden />
        <div className="glass fixed inset-x-0 bottom-0 z-30 rounded-t-[var(--radius-xl)] border-x-0 border-b-0 px-4 pt-3 pb-safe lg:hidden">
          <Button className="mx-auto flex w-full max-w-xl !min-h-14 !text-sm" onClick={scanNext} icon={<ScanLine className="size-5" aria-hidden />}>Scan next</Button>
        </div>
      </>}
    </>
  );
}
