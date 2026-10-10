import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { get, patch, post } from '@/api/client';
import type { Event } from '@/api/types';
import { Badge, ErrorBox, Field, PageTitle, datetime, money } from '@/components/ui';

const blank = { title: '', description: '', starts_at: '', venue: '', capacity: '100', member_price: '0', non_member_price: '0', status: 'draft' };

export function AdminEventsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['events'], queryFn: () => get<Event[]>('/events') });
  const [f, setF] = useState<any>(blank); const [editing, setEditing] = useState<number | null>(null);
  const save = useMutation({ mutationFn: () => (editing ? patch(`/events/${editing}`, f) : post('/events', f)), onSuccess: () => { setF(blank); setEditing(null); qc.invalidateQueries({ queryKey: ['events'] }); } });
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: number; status: string }) => patch(`/events/${id}`, { status }), onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }) });
  const edit = (e: Event) => { setEditing(e.id); setF({ title: e.title, description: e.description ?? '', starts_at: e.starts_at.slice(0, 16), venue: e.venue ?? '', capacity: String(e.capacity), member_price: String(e.member_price), non_member_price: String(e.non_member_price), status: e.status }); };
  return (
    <>
      <PageTitle title="Events" />
      <div className="grid gap-6 lg:grid-cols-3">
        <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <h3 className="font-semibold">{editing ? `Edit #${editing}` : 'New event'}</h3>
          <Field label="Title"><input className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Description"><textarea className="input" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Starts"><input className="input" type="datetime-local" required value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></Field>
          <Field label="Venue"><input className="input" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Capacity"><input className="input" type="number" min="1" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
            <Field label="Member ₹"><input className="input" type="number" min="0" value={f.member_price} onChange={(e) => setF({ ...f, member_price: e.target.value })} /></Field>
            <Field label="Non-member ₹"><input className="input" type="number" min="0" value={f.non_member_price} onChange={(e) => setF({ ...f, non_member_price: e.target.value })} /></Field>
          </div>
          <Field label="Status"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option>draft</option><option>published</option><option>closed</option></select></Field>
          <ErrorBox error={save.error} />
          <div className="flex gap-2"><button className="btn-primary flex-1" disabled={save.isPending}>{editing ? 'Save' : 'Create'}</button>{editing && <button type="button" className="btn-secondary" onClick={() => { setEditing(null); setF(blank); }}>Cancel</button>}</div>
        </form>
        <div className="card lg:col-span-2 overflow-x-auto"><table className="table"><thead><tr><th>Event</th><th>When</th><th>Seats</th><th>Prices</th><th>Status</th><th></th></tr></thead><tbody>
          {q.data?.map((e) => <tr key={e.id}><td className="font-medium">{e.title}<div className="text-xs text-slate-500">{e.venue}</div></td><td>{datetime(e.starts_at)}</td><td>{e.capacity - e.seats_left}/{e.capacity}</td><td>{money(e.member_price)} / {money(e.non_member_price)}</td><td><Badge s={e.status} /></td>
            <td className="whitespace-nowrap space-x-1"><button className="text-indigo-600 text-xs" onClick={() => edit(e)}>Edit</button>{e.status === 'draft' && <button className="text-emerald-600 text-xs" onClick={() => setStatus.mutate({ id: e.id, status: 'published' })}>Publish</button>}{e.status === 'published' && <button className="text-slate-600 text-xs" onClick={() => setStatus.mutate({ id: e.id, status: 'closed' })}>Close</button>}<Link className="text-indigo-600 text-xs" to={`/admin/events/${e.id}/report`}>Report</Link></td></tr>)}
        </tbody></table></div>
      </div>
    </>
  );
}
