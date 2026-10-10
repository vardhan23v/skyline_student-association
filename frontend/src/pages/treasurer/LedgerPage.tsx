import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/api/client';
import type { LedgerRow } from '@/api/types';
import { getToken } from '@/auth/token';
import { ErrorBox, Field, PageTitle, datetime, money } from '@/components/ui';

export function LedgerPage() {
  const qc = useQueryClient();
  const [f, setF] = useState({ from: '', to: '', category: '' });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const q = useQuery({ queryKey: ['ledger', qs], queryFn: () => get<LedgerRow[]>(`/finance/ledger?${qs}`) });
  const reverse = useMutation({ mutationFn: ({ id, memo }: { id: number; memo: string }) => post(`/finance/ledger/${id}/reverse`, { memo }), onSuccess: () => qc.invalidateQueries() });
  const exportCsv = async () => {
    const res = await fetch(`/api/finance/ledger?${qs}&format=csv`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = 'ledger.csv'; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <>
      <PageTitle title="Ledger" sub="Append-only. Mistakes are fixed with reversing entries, never edits." action={<button className="btn-secondary" onClick={exportCsv}>Export CSV</button>} />
      <div className="card mb-4 flex flex-wrap gap-2 items-end">
        <Field label="From"><input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To"><input type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Category"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">All</option>{['dues', 'ticket', 'merch', 'fundraiser', 'reimbursement', 'other'].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <span className="text-sm text-slate-500 ml-auto">{q.data?.length ?? 0} rows</span>
      </div>
      <ErrorBox error={reverse.error} />
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>#</th><th>When</th><th>Dir</th><th>Amount</th><th>Category</th><th>Source</th><th>Attributed to</th><th>Memo</th><th>By</th><th></th></tr></thead><tbody>
        {q.data?.map((r) => <tr key={r.id}><td>{r.id}</td><td className="whitespace-nowrap">{datetime(r.occurred_at)}</td><td className={r.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'}>{r.direction}</td><td className="font-medium">{money(r.amount)}</td><td>{r.category}</td><td className="text-xs">{r.source_type}#{r.source_id}</td><td className="text-xs">{r.event_title ?? r.fundraiser_name ?? ''}</td><td className="text-xs">{r.memo}</td><td className="text-xs">{r.entered_by_name}</td>
          <td>{r.source_type !== 'reversal' && <button className="text-xs text-rose-600" onClick={() => { const memo = prompt('Reason for reversal?'); if (memo) reverse.mutate({ id: r.id, memo }); }}>Reverse</button>}</td></tr>)}
      </tbody></table></div>
    </>
  );
}
