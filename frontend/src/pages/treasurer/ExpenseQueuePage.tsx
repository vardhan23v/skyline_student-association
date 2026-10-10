import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ExternalLink, FileWarning, Wallet, X } from 'lucide-react';
import { get, patch } from '@/api/client';
import type { Expense } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { LabeledTextarea, Select } from '@/components/Input';
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { datetime, money } from '@/components/format';

type Action = { kind: 'approved' | 'rejected' | 'pay'; x: Expense } | null;

/** Review queue. Flags carry their rule text; they prompt review, never auto-reject. Every decision goes through a modal. */
export function ExpenseQueuePage() {
  const qc = useQueryClient(); const toast = useToast();
  const [status, setStatus] = useState('submitted');
  const [act, setAct] = useState<Action>(null); const [note, setNote] = useState('');
  const q = useQuery({ queryKey: ['expenses', status], queryFn: () => get<Expense[]>(`/expenses${status ? `?status=${status}` : ''}`) });
  const done = (msg: string) => { setAct(null); setNote(''); qc.invalidateQueries(); toast.success(msg); };
  const review = useMutation({ mutationFn: ({ id, decision, note }: { id: number; decision: string; note?: string }) => patch(`/expenses/${id}/review`, { decision, note }), onSuccess: (_r, v) => done(`Expense ${v.decision}`) });
  const pay = useMutation({ mutationFn: (id: number) => patch(`/expenses/${id}/pay`), onSuccess: () => done('Marked paid · ledger entry written') });
  const flaggedCount = q.data?.filter((x) => x.flags.length).length ?? 0;
  return (
    <>
      <PageHeader eyebrow="Reimbursements" title="Expense review" description={flaggedCount ? `${flaggedCount} of ${q.data?.length} carry anomaly flags.` : 'Approve, reject, then mark paid when the money is handed over.'}
        actions={<div><label htmlFor="st" className="label">Show</label><Select id="st" className="!w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="submitted">Submitted</option><option value="approved">Approved (to pay)</option><option value="paid">Paid</option><option value="rejected">Rejected</option><option value="">All</option></Select></div>} />
      {q.isLoading ? <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="card"><Skeleton rows={3} /></div>)}</div> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="Queue is clear" description="Nothing in this state." /> : (
        <ul className="space-y-3">{q.data.map((x) => (
          <li key={x.id}><article className={`card ${x.flags.length ? 'border-warning/50' : ''}`} aria-labelledby={`x-${x.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2"><span id={`x-${x.id}`} className="t-metric !text-2xl">{money(x.amount)}</span><span className="t-label">{x.category} · #{x.id}</span></div>
                <div className="mt-1 text-sm">{x.description}</div>
                <div className="t-caption mt-0.5">by {x.submitted_by_name} · {datetime(x.created_at)}</div>
              </div>
              <div className="flex flex-col items-end gap-1.5"><StatusBadge status={x.status} />{x.receipt_url ? <a className="inline-flex items-center gap-1 text-xs text-accent" href={x.receipt_url} target="_blank" rel="noreferrer">View receipt<ExternalLink className="size-3" aria-hidden /></a> : <span className="inline-flex items-center gap-1 text-xs text-danger"><FileWarning className="size-3" aria-hidden />No receipt</span>}</div>
            </div>
            {x.flags.length > 0 && <ul className="mt-3 space-y-1" aria-label="Anomaly flags">{x.flags.map((f) => <li key={f.code} className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-warning-soft px-2.5 py-1.5 text-xs text-warning"><AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden /><span><span className="font-mono">{f.code}</span> · {f.rule}</span></li>)}</ul>}
            {x.review_note && <div className="t-caption mt-2">Note: {x.review_note}</div>}
            {(x.status === 'submitted' || x.status === 'approved') && (
              <div className="mt-3 flex flex-wrap gap-2">
                {x.status === 'submitted' && <><Button size="sm" onClick={() => setAct({ kind: 'approved', x })} icon={<Check className="size-3.5" aria-hidden />}>Approve</Button><Button size="sm" variant="danger" onClick={() => setAct({ kind: 'rejected', x })} icon={<X className="size-3.5" aria-hidden />}>Reject</Button></>}
                {x.status === 'approved' && <Button size="sm" onClick={() => setAct({ kind: 'pay', x })} icon={<Wallet className="size-3.5" aria-hidden />}>Mark paid → ledger</Button>}
              </div>
            )}
          </article></li>
        ))}</ul>
      )}
      <Modal open={!!act} onClose={() => setAct(null)} size="sm"
        title={act?.kind === 'pay' ? `Mark ${money(act.x.amount)} as paid?` : act?.kind === 'approved' ? 'Approve this expense?' : 'Reject this expense?'}
        description={act?.kind === 'pay' ? 'This writes an irreversible ledger entry. Only do this once the money has been handed over.' : 'The submitter is emailed your decision.'}
        footer={<><Button variant="secondary" onClick={() => setAct(null)}>Cancel</Button>
          {act?.kind === 'pay' ? <Button loading={pay.isPending} onClick={() => pay.mutate(act.x.id)}>Confirm payment</Button>
            : <Button variant={act?.kind === 'rejected' ? 'danger' : 'primary'} disabled={act?.kind === 'rejected' && !note.trim()} loading={review.isPending} onClick={() => act && review.mutate({ id: act.x.id, decision: act.kind, note: note.trim() || undefined })}>{act?.kind === 'rejected' ? 'Reject' : 'Approve'}</Button>}</>}>
        {act && <div className="space-y-4"><div className="card-sunken p-3 text-sm"><div className="flex justify-between"><span>{act.x.description ?? act.x.category}</span><span className="t-num font-medium">{money(act.x.amount)}</span></div><div className="t-caption mt-1">by {act.x.submitted_by_name}</div></div>
          {act.kind !== 'pay' && <LabeledTextarea label={act.kind === 'rejected' ? 'Reason (required)' : 'Note (optional)'} rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />}
          <ErrorState error={review.error ?? pay.error} /></div>}
      </Modal>
    </>
  );
}
