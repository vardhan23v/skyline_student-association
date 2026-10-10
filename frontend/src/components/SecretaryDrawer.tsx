import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post } from '@/api/client';

type Turn = { role: 'user' | 'ai'; text: string; proposal?: { id: string; action: string; payload: any; required_role: string }; done?: boolean };

/** AI Secretary chat drawer (§10). Proposals are executed only after explicit confirmation. */
export function SecretaryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [turns, setTurns] = useState<Turn[]>([{ role: 'ai', text: 'Ask me about balance, flagged expenses, expiring memberships, overdue tasks or an event report. I only answer from live data.' }]);
  const [input, setInput] = useState('');
  const ask = useMutation({ mutationFn: (prompt: string) => post<any>('/ai/ask', { prompt }), onSuccess: (r) => setTurns((t) => [...t, { role: 'ai', text: r.answer, proposal: r.proposal ?? undefined }]) , onError: (e: any) => setTurns((t) => [...t, { role: 'ai', text: `Error: ${e.message}` }]) });
  const confirm = useMutation({ mutationFn: (id: string) => post<any>(`/ai/confirm/${id}`), onSuccess: (_r, id) => { setTurns((t) => t.map((x) => (x.proposal?.id === id ? { ...x, done: true } : x))); qc.invalidateQueries(); } });
  const send = () => { if (!input.trim()) return; setTurns((t) => [...t, { role: 'user', text: input }]); ask.mutate(input); setInput(''); };
  if (!open) return null;
  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col">
      <div className="p-4 border-b flex items-center justify-between"><h3 className="font-semibold">✨ AI Secretary</h3><button onClick={onClose} className="text-slate-500">✕</button></div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
        {turns.map((t, i) => (
          <div key={i} className={t.role === 'user' ? 'text-right' : ''}>
            <div className={`inline-block rounded-xl px-3 py-2 max-w-[90%] text-left ${t.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}>{t.text}</div>
            {t.proposal && (
              <div className="mt-2 card !p-3 text-left">
                <div className="text-xs uppercase text-slate-500">Proposed action · {t.proposal.action} · needs {t.proposal.required_role}</div>
                <pre className="text-xs bg-slate-50 rounded p-2 mt-1 whitespace-pre-wrap">{JSON.stringify(t.proposal.payload, null, 1)}</pre>
                <button className="btn-primary mt-2 !py-1" disabled={t.done || confirm.isPending} onClick={() => confirm.mutate(t.proposal!.id)}>{t.done ? 'Executed ✓' : 'Confirm & execute'}</button>
                {confirm.error && <div className="text-xs text-rose-700 mt-1">{(confirm.error as any).message}</div>}
              </div>
            )}
          </div>
        ))}
        {ask.isPending && <div className="text-slate-400">Thinking…</div>}
      </div>
      <div className="p-3 border-t flex gap-2"><input className="input" placeholder="e.g. what is our balance?" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} /><button className="btn-primary" onClick={send}>Send</button></div>
    </div>
  );
}
