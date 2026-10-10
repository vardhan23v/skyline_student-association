import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { get, patch, post } from '@/api/client';
import type { Fundraiser } from '@/api/types';
import { Badge, ErrorBox, Field, PageTitle, money } from '@/components/ui';

export function AdminFundraisersPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['fundraisers'], queryFn: () => get<Fundraiser[]>('/fundraisers') });
  const [f, setF] = useState({ name: '', description: '', target_amount: '10000', budget: '', starts_on: '', ends_on: '', status: 'planning' });
  const create = useMutation({ mutationFn: () => post('/fundraisers', { ...f, budget: f.budget || undefined, starts_on: f.starts_on || undefined, ends_on: f.ends_on || undefined }), onSuccess: () => { setF({ ...f, name: '', description: '' }); qc.invalidateQueries({ queryKey: ['fundraisers'] }); } });
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: number; status: string }) => patch(`/fundraisers/${id}`, { status }), onSuccess: () => qc.invalidateQueries({ queryKey: ['fundraisers'] }) });
  return (
    <>
      <PageTitle title="Fundraisers" />
      <div className="grid gap-6 lg:grid-cols-3">
        <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <h3 className="font-semibold">New fundraiser</h3>
          <Field label="Name"><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Target ₹"><input className="input" type="number" value={f.target_amount} onChange={(e) => setF({ ...f, target_amount: e.target.value })} /></Field><Field label="Budget ₹"><input className="input" type="number" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} /></Field></div>
          <div className="grid grid-cols-2 gap-2"><Field label="Starts"><input className="input" type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} /></Field><Field label="Ends"><input className="input" type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} /></Field></div>
          <ErrorBox error={create.error} /><button className="btn-primary w-full">Create</button>
        </form>
        <div className="lg:col-span-2 space-y-3">
          {q.data?.map((x) => <div key={x.id} className="card">
            <div className="flex justify-between gap-2"><h3 className="font-semibold">{x.name}</h3><Badge s={x.status} /></div>
            <div className="text-sm text-slate-600 mt-1">{x.description}</div>
            <div className="mt-3 h-2 bg-slate-200 rounded-full"><div className="h-2 bg-emerald-500 rounded-full" style={{ width: `${Math.round((x.progress ?? 0) * 100)}%` }} /></div>
            <div className="flex flex-wrap gap-4 text-sm mt-2"><span>Raised <b>{money(x.raised)}</b> / {money(x.target_amount)}</span><span>Spent <b>{money(x.spent)}</b>{x.budget != null && ` / budget ${money(x.budget)}`}</span><span>Tasks {x.tasks_done}/{x.tasks_total}{x.tasks_overdue > 0 && <span className="text-rose-700"> ({x.tasks_overdue} overdue)</span>}</span></div>
            <div className="flex gap-2 mt-3 text-xs"><Link className="text-indigo-600" to="/volunteer/tasks">Task board</Link>{x.status === 'planning' && <button className="text-emerald-600" onClick={() => setStatus.mutate({ id: x.id, status: 'active' })}>Activate</button>}{x.status === 'active' && <button className="text-slate-600" onClick={() => setStatus.mutate({ id: x.id, status: 'closed' })}>Close</button>}</div>
          </div>)}
        </div>
      </div>
    </>
  );
}
