import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ClipboardList, Plus, Target } from 'lucide-react';
import { get, patch, post } from '@/api/client';
import type { Fundraiser } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { LabeledInput } from '@/components/Input';
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { money } from '@/components/format';

const blank = { name: '', description: '', target_amount: '10000', budget: '', starts_on: '', ends_on: '', status: 'planning' };

export function AdminFundraisersPage() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['fundraisers'], queryFn: () => get<Fundraiser[]>('/fundraisers') });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const close = () => setOpen(false);
  const create = useMutation({ mutationFn: () => post('/fundraisers', { ...f, description: f.description || undefined, budget: f.budget || undefined, starts_on: f.starts_on || undefined, ends_on: f.ends_on || undefined }), onSuccess: () => { setF(blank); setOpen(false); qc.invalidateQueries({ queryKey: ['fundraisers'] }); toast.success('Fundraiser created'); } });
  const openNew = () => { create.reset(); setOpen(true); };
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: number; status: string }) => patch(`/fundraisers/${id}`, { status }), onSuccess: (_r, v) => { qc.invalidateQueries({ queryKey: ['fundraisers'] }); toast.success(`Fundraiser ${v.status}`); }, onError: (e: Error) => toast.error('Update failed', e.message) });
  return (
    <>
      <PageHeader eyebrow="Fundraisers" title="Fundraisers" description="Raised totals come from the ledger; spent totals from paid reimbursements." actions={<Button onClick={openNew} icon={<Plus className="size-4" aria-hidden />}>New fundraiser</Button>} />
      {q.isLoading ? <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="card"><Skeleton rows={4} /></div>)}</div> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState icon={<Target className="size-5" aria-hidden />} title="No fundraisers yet" action={<Button onClick={openNew}>Create one</Button>} /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data.map((x) => {
            const pct = Math.round((x.progress ?? 0) * 100);
            const overBudget = x.budget != null && x.spent > Number(x.budget);
            return (
              <article key={x.id} className={`card flex flex-col gap-4 ${x.status === 'active' ? 'glow-corner' : ''}`}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="t-section text-lg">{x.name}</h2>{x.description && <p className="t-caption mt-0.5">{x.description}</p>}</div><StatusBadge status={x.status} /></div>
                <div>
                  <div className="flex items-end justify-between gap-2"><span className="t-metric !text-2xl">{money(x.raised)}</span><span className="t-caption t-num">{pct}% of {money(x.target_amount)}</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-elevated" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${x.name}: ${pct}% of target`}><div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} /></div>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="t-label">Spent</dt><dd className={`mt-0.5 t-num ${overBudget ? 'text-danger' : ''}`}>{money(x.spent)}{x.budget != null && <span className="block t-caption">of {money(x.budget)} budget{overBudget && ' · over'}</span>}</dd></div>
                  <div><dt className="t-label">Tasks</dt><dd className="mt-0.5 t-num">{x.tasks_done}/{x.tasks_total}</dd></div>
                  <div><dt className="t-label">Overdue</dt><dd className={`mt-0.5 t-num inline-flex items-center gap-1 ${x.tasks_overdue ? 'text-danger' : ''}`}>{x.tasks_overdue > 0 && <AlertTriangle className="size-3.5" aria-hidden />}{x.tasks_overdue}</dd></div>
                </dl>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Link className="btn-secondary !min-h-10 !text-xs" to={`/volunteer/tasks?fundraiser=${x.id}`}><ClipboardList className="size-3.5" aria-hidden />Task board</Link>
                  {x.status === 'planning' && <Button size="sm" className="!min-h-10" loading={setStatus.isPending && setStatus.variables?.id === x.id} onClick={() => setStatus.mutate({ id: x.id, status: 'active' })}>Activate</Button>}
                  {x.status === 'active' && <Button size="sm" variant="ghost" className="!min-h-10" loading={setStatus.isPending && setStatus.variables?.id === x.id} onClick={() => setStatus.mutate({ id: x.id, status: 'closed' })}>Close</Button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Modal open={open} onClose={close} variant="drawer" title="New fundraiser" footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button form="fr-form" type="submit" loading={create.isPending}>Create</Button></>}>
        <form id="fr-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <LabeledInput label="Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <LabeledInput label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-2"><LabeledInput label="Target ₹" type="number" inputMode="decimal" min="0" step="0.01" required value={f.target_amount} onChange={(e) => setF({ ...f, target_amount: e.target.value })} /><LabeledInput label="Budget ₹" type="number" inputMode="decimal" min="0" step="0.01" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} hint="Expenses beyond this get flagged." /></div>
          <div className="grid grid-cols-2 gap-2"><LabeledInput label="Starts" type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} /><LabeledInput label="Ends" type="date" min={f.starts_on || undefined} value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} /></div>
          <ErrorState error={create.error} />
        </form>
      </Modal>
    </>
  );
}
