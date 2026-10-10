import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';
import { get, patch, post } from '@/api/client';
import type { Fundraiser, Task } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { TaskCard } from '@/components/TaskCard';
import { Button } from '@/components/Button';
import { Input, Select } from '@/components/Input';
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState';
import { useToast } from '@/components/Toast';
import { money } from '@/components/format';

const cols: Task['status'][] = ['todo', 'doing', 'done'];

/** Kanban on desktop; on phones the columns stack with sticky headers so a one-handed scroll works. */
export function TaskBoardPage() {
  const { me, has } = useAuth(); const qc = useQueryClient(); const toast = useToast();
  const fr = useQuery({ queryKey: ['fundraisers'], queryFn: () => get<Fundraiser[]>('/fundraisers') });
  const [fid, setFid] = useState<number | null>(null);
  const active = fid ?? fr.data?.[0]?.id ?? null;
  const tasks = useQuery({ queryKey: ['tasks', active], queryFn: () => get<Task[]>(`/fundraisers/${active}/tasks`), enabled: !!active });
  const move = useMutation({ mutationFn: ({ id, status }: { id: number; status: Task['status'] }) => patch(`/tasks/${id}`, { status }), onSuccess: (_r, v) => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['fundraisers'] }); toast.success(`Moved to ${v.status}`); }, onError: (e: any) => toast.error('Could not move task', e.message) });
  const [draft, setDraft] = useState({ title: '', due_on: '' });
  const add = useMutation({ mutationFn: () => post(`/fundraisers/${active}/tasks`, { title: draft.title, due_on: draft.due_on || null }), onSuccess: () => { setDraft({ title: '', due_on: '' }); qc.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Task added'); } });
  const f = fr.data?.find((x) => x.id === active);
  return (
    <>
      <PageHeader eyebrow="Fundraisers" title="Task board" description="Owners and due dates are visible on every card. Only the assignee or an admin moves it."
        actions={fr.data && fr.data.length > 0 && <div><label htmlFor="fr" className="label">Fundraiser</label><Select id="fr" className="!w-auto" value={active ?? ''} onChange={(e) => setFid(Number(e.target.value))}>{fr.data.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></div>} />
      {fr.isLoading ? <div className="card"><Skeleton rows={4} /></div> : fr.error ? <ErrorState error={fr.error} onRetry={() => fr.refetch()} /> : !fr.data?.length ? <EmptyState icon={<ClipboardList className="size-5" aria-hidden />} title="No fundraisers yet" description="Admins create fundraisers; tasks live inside them." /> : f && (<>
        <div className="card mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <div><span className="t-label block">Raised</span><span className="t-num font-medium">{money(f.raised)}</span> <span className="text-text-secondary">of {money(f.target_amount)}</span></div>
          <div className="min-w-40 flex-1"><div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated" role="progressbar" aria-valuenow={Math.round((f.progress ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Fundraiser progress"><div className="h-full rounded-full bg-success" style={{ width: `${Math.round((f.progress ?? 0) * 100)}%` }} /></div></div>
          <div><span className="t-label block">Tasks</span><span className="t-num font-medium">{f.tasks_done}/{f.tasks_total}</span> done{f.tasks_overdue > 0 && <span className="text-danger"> · {f.tasks_overdue} overdue</span>}</div>
          <StatusBadge status={f.status} />
        </div>
        {has('admin') && (
          <form className="card mb-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
            <div className="min-w-48 flex-1"><label htmlFor="nt" className="label">New task</label><Input id="nt" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="What needs doing?" /></div>
            <div><label htmlFor="nd" className="label">Due</label><Input id="nd" type="date" value={draft.due_on} onChange={(e) => setDraft({ ...draft, due_on: e.target.value })} /></div>
            <Button type="submit" disabled={!draft.title} loading={add.isPending} icon={<Plus className="size-4" aria-hidden />}>Add</Button>
            <ErrorState error={add.error} className="w-full" />
          </form>
        )}
        {tasks.error ? <ErrorState error={tasks.error} onRetry={() => tasks.refetch()} /> : (
          <div className="grid gap-4 md:grid-cols-3">
            {cols.map((c) => {
              const list = tasks.data?.filter((t) => t.status === c) ?? [];
              return (
                <section key={c} className="card-sunken min-h-40 p-3" aria-labelledby={`col-${c}`}>
                  <h2 id={`col-${c}`} className="sticky top-14 z-10 mb-2 flex items-center justify-between rounded-[var(--radius-sm)] bg-surface-sunken/90 px-1 py-1 backdrop-blur t-label !text-text-secondary lg:top-0">{c}<span className="font-mono">{list.length}</span></h2>
                  {tasks.isLoading ? <Skeleton rows={3} /> : list.length === 0 ? <p className="px-1 py-6 text-center t-caption">Empty</p> : (
                    <div className="space-y-2">{list.map((t) => <TaskCard key={t.id} task={t} canMove={t.assignee_id === me?.user.id || has('admin')} pending={move.isPending} onMove={(s) => move.mutate({ id: t.id, status: s })} />)}</div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </>)}
    </>
  );
}
