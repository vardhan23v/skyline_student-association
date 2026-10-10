import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch } from '@/api/client';
import type { Expense } from '@/api/types';
import { Badge, Empty, ErrorBox, PageTitle, datetime, money } from '@/components/ui';

/** §6.2 steps 2–3. Flags carry the rule text; they prompt review, never auto-reject. */
export function ExpenseQueuePage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('submitted');
  const q = useQuery({ queryKey: ['expenses', status], queryFn: () => get<Expense[]>(`/expenses${status ? `?status=${status}` : ''}`) });
  const review = useMutation({ mutationFn: ({ id, decision, note }: { id: number; decision: string; note?: string }) => patch(`/expenses/${id}/review`, { decision, note }), onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }) });
  const pay = useMutation({ mutationFn: (id: number) => patch(`/expenses/${id}/pay`), onSuccess: () => qc.invalidateQueries() });
  return (
    <>
      <PageTitle title="Expense review" action={<select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="submitted">Submitted</option><option value="approved">Approved (to pay)</option><option value="paid">Paid</option><option value="rejected">Rejected</option><option value="">All</option></select>} />
      <ErrorBox error={review.error ?? pay.error} />
      {!q.data?.length ? <Empty>Nothing here.</Empty> : <div className="space-y-3">{q.data.map((x) => (
        <div key={x.id} className={`card ${x.flags.length ? 'border-amber-300' : ''}`}>
          <div className="flex flex-wrap justify-between gap-2">
            <div><span className="text-xl font-semibold">{money(x.amount)}</span> <span className="text-slate-500 text-sm">· {x.category} · #{x.id}</span><div className="text-sm mt-1">{x.description}</div><div className="text-xs text-slate-500">by {x.submitted_by_name} · {datetime(x.created_at)}</div></div>
            <div className="text-right"><Badge s={x.status} />{x.receipt_url ? <div className="mt-1"><a className="text-xs text-indigo-600" href={x.receipt_url} target="_blank" rel="noreferrer">View receipt</a></div> : <div className="text-xs text-rose-600 mt-1">No receipt</div>}</div>
          </div>
          {x.flags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{x.flags.map((f) => <span key={f.code} className="badge bg-amber-100 text-amber-900" title={f.rule}>⚠ {f.code}: {f.rule}</span>)}</div>}
          {x.review_note && <div className="text-xs text-slate-600 mt-2">Note: {x.review_note}</div>}
          <div className="flex gap-2 mt-3">
            {x.status === 'submitted' && <><button className="btn-primary !py-1" onClick={() => review.mutate({ id: x.id, decision: 'approved', note: prompt('Note (optional)') ?? undefined })}>Approve</button><button className="btn-danger !py-1" onClick={() => { const note = prompt('Reason for rejection'); if (note) review.mutate({ id: x.id, decision: 'rejected', note }); }}>Reject</button></>}
            {x.status === 'approved' && <button className="btn-primary !py-1" onClick={() => confirm(`Mark ${money(x.amount)} as paid? This writes a ledger entry.`) && pay.mutate(x.id)}>Mark paid → ledger</button>}
          </div>
        </div>
      ))}</div>}
    </>
  );
}
