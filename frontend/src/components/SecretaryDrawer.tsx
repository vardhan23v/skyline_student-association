import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { post } from '@/api/client';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';

type Turn = { role: 'user' | 'ai'; text: string; proposal?: { id: string; action: string; payload: any; required_role: string }; done?: boolean; verified?: boolean };
const starters = ['What is our balance?', 'Any flagged expenses?', 'Which memberships expire soon?', 'Overdue tasks?'];

/** AI Secretary. Answers come from server-side tools only; proposals execute only after explicit confirmation. */
export function SecretaryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [turns, setTurns] = useState<Turn[]>([{ role: 'ai', text: 'Ask me about balance, flagged expenses, expiring memberships, overdue tasks or an event report. I only answer from live data.' }]);
  const [input, setInput] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const ask = useMutation({ mutationFn: (prompt: string) => post<any>('/ai/ask', { prompt }), onSuccess: (r) => setTurns((t) => [...t, { role: 'ai', text: r.answer, proposal: r.proposal ?? undefined, verified: r.numbers_verified }]), onError: (e: any) => setTurns((t) => [...t, { role: 'ai', text: `Error: ${e.message}` }]) });
  const confirm = useMutation({ mutationFn: (id: string) => post<any>(`/ai/confirm/${id}`), onSuccess: (_r, id) => { setTurns((t) => t.map((x) => (x.proposal?.id === id ? { ...x, done: true } : x))); qc.invalidateQueries(); } });
  const send = (text = input) => { if (!text.trim()) return; setTurns((t) => [...t, { role: 'user', text }]); ask.mutate(text); setInput(''); };
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [turns, ask.isPending]);
  return (
    <Modal open={open} onClose={onClose} variant="drawer" title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-accent" aria-hidden />AI Secretary</span>} description="Read-only answers. Actions need your confirmation."
      footer={<form className="flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}><label htmlFor="ai-q" className="sr-only">Ask the secretary</label><Input id="ai-q" placeholder="e.g. what is our balance?" value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off" /><Button type="submit" aria-label="Send" loading={ask.isPending}><Send className="size-4" aria-hidden /></Button></form>}>
      <div className="space-y-3 text-sm" role="log" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className={t.role === 'user' ? 'flex justify-end' : ''}>
            <div className={`max-w-[90%] rounded-[var(--radius-lg)] px-3.5 py-2.5 ${t.role === 'user' ? 'bg-accent-strong text-accent-foreground' : 'card-sunken'}`}>
              <div className="whitespace-pre-wrap">{t.text}</div>
              {t.role === 'ai' && t.verified === true && <div className="mt-1.5 inline-flex items-center gap-1 t-label !text-success"><ShieldCheck className="size-3" aria-hidden />numbers verified against tool output</div>}
              {t.proposal && (
                <div className="mt-3 rounded-[var(--radius-md)] border border-border-strong bg-surface p-3">
                  <div className="t-label">Proposed action · {t.proposal.action} · needs {t.proposal.required_role}</div>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-surface-sunken p-2 font-mono text-[11px] leading-relaxed">{JSON.stringify(t.proposal.payload, null, 1)}</pre>
                  <Button size="sm" className="mt-2" disabled={t.done} loading={confirm.isPending && confirm.variables === t.proposal.id} onClick={() => confirm.mutate(t.proposal!.id)} icon={t.done ? <Check className="size-3.5" aria-hidden /> : undefined}>{t.done ? 'Executed' : 'Confirm & execute'}</Button>
                  {confirm.error && confirm.variables === t.proposal.id && <div className="mt-1 text-xs text-danger" role="alert">{(confirm.error as any).message}</div>}
                </div>
              )}
            </div>
          </div>
        ))}
        {ask.isPending && <div className="card-sunken inline-flex items-center gap-2 px-3.5 py-2.5 text-text-secondary" role="status"><span className="skeleton h-2 w-16" />Thinking…</div>}
        {turns.length === 1 && <div className="flex flex-wrap gap-1.5 pt-1">{starters.map((s) => <button key={s} onClick={() => send(s)} className="btn-secondary !min-h-9 !px-3 !text-xs">{s}</button>)}</div>}
        <div ref={end} />
      </div>
    </Modal>
  );
}
