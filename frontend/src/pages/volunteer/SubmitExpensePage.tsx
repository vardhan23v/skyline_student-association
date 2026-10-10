import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { get, post } from '@/api/client';
import type { Event, Expense, Fundraiser } from '@/api/types';
import { Badge, ErrorBox, Field, PageTitle, money } from '@/components/ui';

/** §6.2 step 1 — receipt (≤5 MB jpeg/png/pdf) is base64-encoded in the JSON body; the server hashes it for duplicate detection. */
export function SubmitExpensePage() {
  const events = useQuery({ queryKey: ['events'], queryFn: () => get<Event[]>('/events') });
  const frs = useQuery({ queryKey: ['fundraisers'], queryFn: () => get<Fundraiser[]>('/fundraisers') });
  const mine = useQuery({ queryKey: ['expenses', 'mine'], queryFn: () => get<Expense[]>('/expenses?mine=true') });
  const [f, setF] = useState({ amount: '', category: 'supplies', description: '', event_id: '', fundraiser_id: '' });
  const [file, setFile] = useState<File | null>(null);
  const submit = useMutation({
    mutationFn: async () => {
      let receipt_base64: string | undefined, receipt_mime: string | undefined;
      if (file) { if (file.size > 5 * 1024 * 1024) throw new Error('Receipt exceeds 5 MB'); receipt_mime = file.type; receipt_base64 = btoa(new Uint8Array(await file.arrayBuffer()).reduce((s, b) => s + String.fromCharCode(b), '')); }
      return post<Expense>('/expenses', { amount: Number(f.amount), category: f.category, description: f.description || undefined, event_id: f.event_id ? Number(f.event_id) : undefined, fundraiser_id: f.fundraiser_id ? Number(f.fundraiser_id) : undefined, receipt_base64, receipt_mime });
    },
    onSuccess: () => { setF({ amount: '', category: 'supplies', description: '', event_id: '', fundraiser_id: '' }); setFile(null); mine.refetch(); },
  });
  return (
    <>
      <PageTitle title="Submit expense" sub="Attach the receipt. The treasurer reviews, then pays." />
      <div className="grid gap-6 lg:grid-cols-2">
        <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
          <Field label="Amount (₹)"><input className="input" type="number" min="1" step="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Category"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{['supplies', 'food', 'venue', 'printing', 'decor', 'transport', 'other'].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Linked event (optional)"><select className="input" value={f.event_id} onChange={(e) => setF({ ...f, event_id: e.target.value })}><option value="">—</option>{events.data?.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></Field>
          <Field label="Linked fundraiser (optional)"><select className="input" value={f.fundraiser_id} onChange={(e) => setF({ ...f, fundraiser_id: e.target.value })}><option value="">—</option>{frs.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Field label="Receipt (jpeg/png/pdf, ≤5 MB)"><input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          <ErrorBox error={submit.error} />
          {submit.data && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">Submitted as #{submit.data.id}{submit.data.flags.length > 0 && ` (flagged: ${submit.data.flags.map((x) => x.code).join(', ')})`}</div>}
          <button className="btn-primary w-full" disabled={submit.isPending}>Submit</button>
        </form>
        <div className="card"><h3 className="font-semibold mb-2">My expenses</h3>
          <table className="table"><thead><tr><th>#</th><th>Amount</th><th>What</th><th>Status</th></tr></thead><tbody>
            {mine.data?.map((x) => <tr key={x.id}><td>{x.id}</td><td>{money(x.amount)}</td><td>{x.description ?? x.category}{x.review_note && <div className="text-xs text-slate-500">{x.review_note}</div>}</td><td><Badge s={x.status} /></td></tr>)}
          </tbody></table></div>
      </div>
    </>
  );
}
