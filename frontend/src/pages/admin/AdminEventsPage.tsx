import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BarChart3, Pencil, Plus } from 'lucide-react';
import { get, patch, post } from '@/api/client';
import type { Event } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { LabeledInput, LabeledSelect, LabeledTextarea } from '@/components/Input';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { datetime, money } from '@/components/format';

const blank = { title: '', description: '', starts_at: '', venue: '', capacity: '100', member_price: '0', non_member_price: '0', status: 'draft' };

/** Admin list + create/edit drawer. Publish/close are one-tap row actions. */
export function AdminEventsPage() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['events'], queryFn: () => get<Event[]>('/events') });
  const [f, setF] = useState<any>(blank); const [editing, setEditing] = useState<number | null>(null); const [open, setOpen] = useState(false);
  const close = () => { setOpen(false); setEditing(null); setF(blank); };
  const save = useMutation({ mutationFn: () => (editing ? patch(`/events/${editing}`, f) : post('/events', f)), onSuccess: () => { toast.success(editing ? 'Event updated' : 'Event created'); close(); qc.invalidateQueries({ queryKey: ['events'] }); } });
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: number; status: string }) => patch(`/events/${id}`, { status }), onSuccess: (_r, v) => { toast.success(`Event ${v.status}`); qc.invalidateQueries({ queryKey: ['events'] }); }, onError: (e: any) => toast.error('Update failed', e.message) });
  const edit = (e: Event) => { setEditing(e.id); setF({ title: e.title, description: e.description ?? '', starts_at: e.starts_at.slice(0, 16), venue: e.venue ?? '', capacity: String(e.capacity), member_price: String(e.member_price), non_member_price: String(e.non_member_price), status: e.status }); setOpen(true); };
  return (
    <>
      <PageHeader eyebrow="Events" title="Manage events" actions={<Button onClick={() => { setF(blank); setEditing(null); setOpen(true); }} icon={<Plus className="size-4" aria-hidden />}>New event</Button>} />
      <DataTable rows={q.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} rowKey={(e) => e.id} caption="All events including drafts" empty={<EmptyState title="No events yet" action={<Button onClick={() => setOpen(true)}>Create the first event</Button>} />}
        columns={[
          { key: 'event', header: 'Event', render: (e) => <><span className="font-medium">{e.title}</span><span className="block t-caption">{e.venue}</span></> },
          { key: 'when', header: 'When', render: (e) => datetime(e.starts_at) },
          { key: 'seats', header: 'Seats', render: (e) => <span className="t-num">{e.capacity - e.seats_left}<span className="text-text-tertiary">/{e.capacity}</span></span>, align: 'right' },
          { key: 'price', header: 'Member / non', render: (e) => <span className="t-num">{money(e.member_price)} / {money(e.non_member_price)}</span>, hideOnMobile: true },
          { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
          { key: 'actions', header: '', align: 'right', render: (e) => (
            <span className="inline-flex flex-wrap justify-end gap-1">
              <button className="btn-ghost !min-h-9 !px-2.5 !text-xs" onClick={() => edit(e)}><Pencil className="size-3.5" aria-hidden />Edit</button>
              {e.status === 'draft' && <button className="btn-primary !min-h-9 !px-2.5 !text-xs" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: e.id, status: 'published' })}>Publish</button>}
              {e.status === 'published' && <button className="btn-secondary !min-h-9 !px-2.5 !text-xs" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: e.id, status: 'closed' })}>Close</button>}
              <Link className="btn-ghost !min-h-9 !px-2.5 !text-xs" to={`/admin/events/${e.id}/report`}><BarChart3 className="size-3.5" aria-hidden />Report</Link>
            </span>
          ) },
        ]} />
      <Modal open={open} onClose={close} variant="drawer" title={editing ? `Edit event #${editing}` : 'New event'} description="Published events are visible and on sale immediately."
        footer={<><Button variant="secondary" onClick={close} type="button">Cancel</Button><Button form="event-form" type="submit" loading={save.isPending}>{editing ? 'Save changes' : 'Create event'}</Button></>}>
        <form id="event-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <LabeledInput label="Title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <LabeledTextarea label="Description" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <LabeledInput label="Starts" type="datetime-local" required value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} />
          <LabeledInput label="Venue" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <LabeledInput label="Capacity" type="number" inputMode="numeric" min="1" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
            <LabeledInput label="Member ₹" type="number" inputMode="decimal" min="0" value={f.member_price} onChange={(e) => setF({ ...f, member_price: e.target.value })} />
            <LabeledInput label="Non-member ₹" type="number" inputMode="decimal" min="0" value={f.non_member_price} onChange={(e) => setF({ ...f, non_member_price: e.target.value })} />
          </div>
          <LabeledSelect label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option>draft</option><option>published</option><option>closed</option></LabeledSelect>
          <ErrorState error={save.error} />
        </form>
      </Modal>
    </>
  );
}
