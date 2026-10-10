import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Html5Qrcode } from 'html5-qrcode';
import { get, post } from '@/api/client';
import type { Event } from '@/api/types';
import { ErrorBox, PageTitle } from '@/components/ui';

type Result = { ok: boolean; reason?: string; ticket?: { holder_name: string; ticket_type: string; status: string }; membership_active?: boolean };

/** Door check-in (§6.1): camera scan → POST /checkin → green/red result. Double scans are rejected server-side. */
export function ScannerPage() {
  const events = useQuery({ queryKey: ['events'], queryFn: () => get<Event[]>('/events') });
  const [eventId, setEventId] = useState<number | ''>('');
  const [manual, setManual] = useState('');
  const [last, setLast] = useState<Result | null>(null);
  const [log, setLog] = useState<(Result & { at: string })[]>([]);
  const [camera, setCamera] = useState(false);
  const scanner = useRef<Html5Qrcode | null>(null);
  const busy = useRef(false);
  const checkin = useMutation({
    mutationFn: (qr_token: string) => post<Result>('/checkin', { qr_token, event_id: eventId || undefined }).catch((e) => (e.status === 409 ? (JSON.parse(JSON.stringify({ ok: false, reason: e.message })) as Result) : Promise.reject(e))),
    onSuccess: (r) => { setLast(r); setLog((l) => [{ ...r, at: new Date().toLocaleTimeString() }, ...l].slice(0, 20)); },
  });
  // The API returns 409 with a JSON body for rejected scans; surface that body rather than the generic error.
  const submit = async (token: string) => {
    if (busy.current) return; busy.current = true;
    try {
      const res = await fetch('/api/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('ssa_token')}` }, body: JSON.stringify({ qr_token: token, event_id: eventId || undefined }) });
      const r = (await res.json()) as Result;
      setLast(r); setLog((l) => [{ ...r, at: new Date().toLocaleTimeString() }, ...l].slice(0, 20));
    } finally { setTimeout(() => (busy.current = false), 1200); }
  };
  useEffect(() => {
    if (!camera) { scanner.current?.stop().catch(() => {}); scanner.current = null; return; }
    const s = new Html5Qrcode('reader'); scanner.current = s;
    s.start({ facingMode: 'environment' }, { fps: 8, qrbox: 220 }, (text) => submit(text), () => {}).catch((e) => { setLast({ ok: false, reason: `Camera error: ${e}` }); setCamera(false); });
    return () => { s.stop().catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, eventId]);
  return (
    <>
      <PageTitle title="Door scanner" sub="Pick the event, then scan tickets. Each QR works exactly once." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value ? Number(e.target.value) : '')}><option value="">Any event (not recommended)</option>{events.data?.filter((e) => e.status !== 'draft').map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select>
          <button className={camera ? 'btn-danger w-full' : 'btn-primary w-full'} onClick={() => setCamera(!camera)}>{camera ? 'Stop camera' : 'Start camera'}</button>
          <div id="reader" className="rounded-lg overflow-hidden" />
          <div className="flex gap-2"><input className="input" placeholder="…or paste QR token" value={manual} onChange={(e) => setManual(e.target.value)} /><button className="btn-secondary" onClick={() => { submit(manual); setManual(''); }}>Check</button></div>
          <ErrorBox error={checkin.error} />
        </div>
        <div className="space-y-3">
          {last && (
            <div className={`rounded-xl p-6 text-center ${last.ok ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'}`}>
              <div className="text-5xl">{last.ok ? '✅' : '❌'}</div>
              <div className="text-xl font-semibold mt-2">{last.ok ? last.ticket?.holder_name : last.reason}</div>
              {last.ticket && <div className="text-sm mt-1">{last.ticket.holder_name} · {last.ticket.ticket_type.replace('_', ' ')} {last.ok && (last.membership_active ? '· active member' : '· non-member')}</div>}
            </div>
          )}
          <div className="card"><h3 className="font-semibold mb-2">Recent scans</h3><ul className="text-sm space-y-1">{log.map((r, i) => <li key={i} className={r.ok ? 'text-emerald-700' : 'text-rose-700'}>{r.at} · {r.ok ? '✓' : '✗'} {r.ticket?.holder_name ?? ''} {r.reason ?? ''}</li>)}</ul></div>
        </div>
      </div>
    </>
  );
}
