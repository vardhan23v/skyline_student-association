import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { EventReportPage } from './EventReportPage';
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

const blank = { title: '', description: '', starts_at: '', venue: '', capacity: '100', member_price: '0', status: 'draft' };

/** `datetime-local` holds wall-clock time with no zone. Show the stored instant in the admin's local time... */
const toLocalInput = (v: string | number | null | undefined) => {
  const d = new Date(v ?? '');
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
/** ...and send an ISO instant back, so the server never reinterprets it in its own (UTC) zone. */
const toIso = (local: string) => (local ? new Date(local).toISOString() : local);

/** Admin › Events: list including drafts, create/edit drawer, publish/close; `?event=<id>` opens the report. */
export function AdminEventsPage() {
  const [params] = useSearchParams();
  const reportId = Number(params.get('event')) || null;
  return reportId ? <EventReportPage id={reportId} /> : <EventsList />;
}

function EventsList() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'events'], queryFn: () => get<Event[]>('/admin/events') });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin', 'events'] }); qc.invalidateQueries({ queryKey: ['events'] }); };
  const [f, setF] = useState<any>(blank); const [editing, setEditing] = useState<number | null>(null); const [open, setOpen] = useState(false);
  const close = () => { setOpen(false); setEditing(null); setF(blank); };
  const save = useMutation({ mutationFn: () => { const body = { ...f, starts_at: toIso(f.starts_at) }; return editing ? patch(`/admin/events/${editing}`, body) : post('/admin/events', body); }, onSuccess: () => { toast.success(editing ? 'Event updated' : 'Event created'); close(); refresh(); } });
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: number; status: string }) => patch(`/admin/events/${id}`, { status }), onSuccess: (_r, v) => { toast.success(`Event ${v.status}`); refresh(); }, onError: (e: any) => toast.error('Update failed', e.message) });
  const openNew = () => { save.reset(); setF(blank); setEditing(null); setOpen(true); };
  const edit = (e: Event) => { save.reset(); setEditing(e.id); setF({ title: e.title, description: e.description ?? '', starts_at: toLocalInput(e.starts_at), venue: e.venue ?? '', capacity: String(e.capacity), member_price: String(e.member_price), status: e.status }); setOpen(true); };
  return (
    <>
      <PageHeader script="manage" title="Events" description="Only members can register, at the member price." actions={<Button onClick={openNew} icon={<Plus className="size-4" aria-hidden />}>New event</Button>} />
      <DataTable rows={q.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} rowKey={(e) => e.id} caption="All events including drafts" empty={<EmptyState title="No events yet" action={<Button onClick={openNew}>Create the first event</Button>} />}
        columns={[
          { key: 'event', header: 'Event', mobile: 'primary', render: (e) => <><span className="font-medium">{e.title}</span><span className="block t-caption">{e.venue}</span></> },
          { key: 'when', header: 'When', render: (e) => datetime(e.starts_at) },
          { key: 'seats', header: 'Seats', render: (e) => <span className="t-num">{e.capacity - e.seats_left}<span className="text-text-tertiary">/{e.capacity}</span></span>, align: 'right' },
          { key: 'price', header: 'Price', render: (e) => <span className="t-num">{Number(e.member_price) === 0 ? 'Free' : money(e.member_price)}</span>, hideOnMobile: true },
          { key: 'status', header: 'Status', mobile: 'status', render: (e) => <StatusBadge status={e.status} /> },
          { key: 'actions', header: '', align: 'right', mobile: 'actions', render: (e) => (
            // Phones: a 2-up grid of full-width 44px buttons at the bottom of the card. Desktop: one compact row.
            <span className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2 md:inline-flex md:flex-wrap md:justify-end md:gap-1">
              <button className="btn-secondary !px-3 !text-xs" onClick={() => edit(e)}><Pencil className="size-3.5" aria-hidden />Edit<span className="sr-only"> {e.title}</span></button>
              {e.status === 'draft' && <button className="btn-primary !px-3 !text-xs" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: e.id, status: 'published' })}>Publish</button>}
              {e.status === 'published' && <button className="btn-secondary !px-3 !text-xs" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: e.id, status: 'closed' })}>Close</button>}
              <Link className="btn-secondary !px-3 !text-xs" to={`/admin?tab=events&event=${e.id}`}><BarChart3 className="size-3.5" aria-hidden />Report<span className="sr-only">, registrations for {e.title}</span></Link>
            </span>
          ) },
        ]} />
      <Modal open={open} onClose={close} variant="drawer" size="lg" title={editing ? `Edit event #${editing}` : 'New event'} description="Published events are visible and open for member registration immediately."
        footer={<><Button variant="secondary" onClick={close} type="button">Cancel</Button><Button form="event-form" type="submit" loading={save.isPending}>{editing ? 'Save changes' : 'Create event'}</Button></>}>
        {/* One column on phones, two from lg; native date-time picker; Save is in the sheet's pinned footer. */}
        <form id="event-form" className="grid gap-4 lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <LabeledInput label="Title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <LabeledInput label="Venue" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} />
          <div className="lg:col-span-2"><LabeledTextarea label="Description" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <LabeledInput label="Starts" type="datetime-local" required value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} />
          <LabeledSelect label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option>draft</option><option>published</option><option>closed</option></LabeledSelect>
          <LabeledInput label="Capacity" type="number" inputMode="numeric" enterKeyHint="next" min="1" step="1" required value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
          <LabeledInput label="Price ₹ (members, 0 = free)" type="number" inputMode="decimal" enterKeyHint="done" min="0" step="0.01" required value={f.member_price} onChange={(e) => setF({ ...f, member_price: e.target.value })} />
          <ErrorState error={save.error} className="lg:col-span-2" />
        </form>
      </Modal>
    </>
  );
}
