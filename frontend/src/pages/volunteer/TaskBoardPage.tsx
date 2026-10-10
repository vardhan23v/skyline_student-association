import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch, post } from '@/api/client';
import type { Fundraiser, Task } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Empty, ErrorBox, PageTitle, date, money } from '@/components/ui';

const cols: Task['status'][] = ['todo', 'doing', 'done'];

/** Fundraiser task board (§1 Fundraisers & Tasks). Assignee or admin moves cards. */
export function TaskBoardPage() {
  const { me, has } = useAuth(); const qc = useQueryClient();
  const fr = useQuery({ queryKey: ['fundraisers'], queryFn: () => get<Fundraiser[]>('/fundraisers') });
  const [fid, setFid] = useState<number | null>(null);
  const active = fid ?? fr.data?.[0]?.id ?? null;
  const tasks = useQuery({ queryKey: ['tasks', active], queryFn: () => get<Task[]>(`/fundraisers/${active}/tasks`), enabled: !!active });
  const move = useMutation({ mutationFn: ({ id, status }: { id: number; status: Task['status'] }) => patch(`/tasks/${id}`, { status }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['fundraisers'] }); } });
  const [draft, setDraft] = useState({ title: '', due_on: '' });
  const add = useMutation({ mutationFn: () => post(`/fundraisers/${active}/tasks`, { title: draft.title, due_on: draft.due_on || null }), onSuccess: () => { setDraft({ title: '', due_on: '' }); qc.invalidateQueries({ queryKey: ['tasks'] }); } });
  const f = fr.data?.find((x) => x.id === active);
  return (
    <>
      <PageTitle title="Task board" action={<select className="input !w-auto" value={active ?? ''} onChange={(e) => setFid(Number(e.target.value))}>{fr.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>} />
      {!fr.data?.length ? <Empty>No fundraisers yet.</Empty> : f && (<>
        <div className="card mb-4 flex flex-wrap gap-6 text-sm">
          <div>Raised <b>{money(f.raised)}</b> of {money(f.target_amount)}</div>
          <div className="flex-1 min-w-40"><div className="h-2 bg-slate-200 rounded-full"><div className="h-2 bg-emerald-500 rounded-full" style={{ width: `${Math.round((f.progress ?? 0) * 100)}%` }} /></div></div>
          <div>Tasks <b>{f.tasks_done}/{f.tasks_total}</b> done{f.tasks_overdue > 0 && <span className="text-rose-700"> · {f.tasks_overdue} overdue</span>}</div>
          <Badge s={f.status} />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {cols.map((c) => (
            <div key={c} className="bg-slate-100 rounded-xl p-3 min-h-40">
              <h3 className="font-semibold capitalize mb-2">{c} <span className="text-slate-400 text-sm">{tasks.data?.filter((t) => t.status === c).length ?? 0}</span></h3>
              <div className="space-y-2">{tasks.data?.filter((t) => t.status === c).map((t) => {
                const mine = t.assignee_id === me?.user.id || has('admin');
                return (
                  <div key={t.id} className={`card !p-3 ${t.overdue ? 'border-rose-300' : ''}`}>
                    <div className="font-medium text-sm">{t.title}</div>
                    <div className="text-xs text-slate-500 mt-1">{t.assignee_name ?? 'Unassigned'} · due {date(t.due_on)} {t.overdue && <span className="text-rose-600 font-medium">overdue</span>}</div>
                    {mine && <div className="flex gap-1 mt-2">{cols.filter((x) => x !== c).map((x) => <button key={x} className="btn-secondary !px-2 !py-0.5 text-xs" onClick={() => move.mutate({ id: t.id, status: x })}>→ {x}</button>)}</div>}
                  </div>
                );
              })}</div>
            </div>
          ))}
        </div>
        {has('admin') && <div className="card mt-4 flex flex-wrap gap-2 items-end"><div className="flex-1"><label className="label">New task</label><input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div><div><label className="label">Due</label><input type="date" className="input" value={draft.due_on} onChange={(e) => setDraft({ ...draft, due_on: e.target.value })} /></div><button className="btn-primary" disabled={!draft.title} onClick={() => add.mutate()}>Add</button></div>}
        <ErrorBox error={move.error ?? add.error} />
      </>)}
    </>
  );
}
