import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { EventReportPage } from './EventReportPage';
import { BarChart3, Copy, MessageCircle, Pencil, Plus, Share2 } from 'lucide-react';
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
import { datetime, eventPrice } from '@/components/format';
import { copyText, eventText, share } from '@/lib/share';
import { EventPhoto } from '@/components/EventPhoto';

const blank = { title: '', description: '', starts_at: '', venue: '', capacity: '100', member_price: '0', non_member_price: '0', members_only: false, status: 'draft', category: '', duration: '', participation: '', image_url: '', image_alt: '' };

/** `datetime-local` holds wall-clock time with no zone. Show the stored instant in the admin's local time... */
const toLocalInput = (v: string | number | null | undefined) => {
  const d = new Date(v ?? '');
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
/** ...and send an ISO instant back, so the server never reinterprets it in its own (UTC) zone. */
const toIso = (local: string) => (local ? new Date(local).toISOString() : local);

/** /admin/events/:id: one event's report and registrations. */
export function AdminEventDetail() {
  const id = Number(useParams().id);
  return <EventReportPage id={id} />;
}

/** /admin/events: list including drafts, create/edit drawer, publish/close, share. */
export function AdminEventsPage() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'events'], queryFn: () => get<Event[]>('/admin/events') });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin', 'events'] }); qc.invalidateQueries({ queryKey: ['events'] }); };
  const [f, setF] = useState<any>(blank); const [editing, setEditing] = useState<number | null>(null); const [open, setOpen] = useState(false);
  const close = () => { setOpen(false); setEditing(null); setF(blank); };
  const [sharing, setSharing] = useState<Event | null>(null);
  const copy = async (e: Event) => { if (await copyText(eventText(e))) toast.success('Copied', 'Paste it into Instagram, Telegram or anywhere else.'); else toast.error('Could not copy', 'Your browser blocked the clipboard.'); };
  const save = useMutation({ mutationFn: () => { const body = { ...f, starts_at: toIso(f.starts_at), category: f.category.trim() || 'general', duration: f.duration.trim() || null, participation: f.participation.trim() || null, image_alt: f.image_url ? f.image_alt.trim() || null : null }; return editing ? patch(`/admin/events/${editing}`, body) : post('/admin/events', body); }, onSuccess: () => { toast.success(editing ? 'Event updated' : 'Event created'); close(); refresh(); } });
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: number; status: string }) => patch(`/admin/events/${id}`, { status }), onSuccess: (_r, v) => { toast.success(`Event ${v.status}`); refresh(); }, onError: (e: any) => toast.error('Update failed', e.message) });
  const openNew = () => { save.reset(); setF(blank); setEditing(null); setOpen(true); };
  const edit = (e: Event) => { save.reset(); setEditing(e.id); setF({ title: e.title, description: e.description ?? '', starts_at: toLocalInput(e.starts_at), venue: e.venue ?? '', capacity: String(e.capacity), member_price: String(e.member_price), non_member_price: String(e.non_member_price), members_only: e.members_only, status: e.status, category: e.category && e.category !== 'general' ? e.category : '', duration: e.duration ?? '', participation: e.participation ?? '', image_url: e.image_url ?? '', image_alt: e.image_alt ?? '' }); setOpen(true); };
  return (
    <>
      <PageHeader script="manage" title="Events" description="Members pay the member price and everyone else the non-member price, unless an event is members only." actions={<Button onClick={openNew} icon={<Plus className="size-4" aria-hidden />}>New event</Button>} />
      <DataTable rows={q.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} rowKey={(e) => e.id} caption="All events including drafts" empty={<EmptyState title="No events yet" action={<Button onClick={openNew}>Create the first event</Button>} />}
        columns={[
          { key: 'event', header: 'Event', mobile: 'primary', render: (e) => <><span className="font-medium">{e.title}</span><span className="block t-caption">{e.venue}</span></> },
          { key: 'when', header: 'When', render: (e) => datetime(e.starts_at) },
          { key: 'seats', header: 'Seats', render: (e) => <span className="t-num">{e.capacity - e.seats_left}<span className="text-text-tertiary">/{e.capacity}</span></span>, align: 'right' },
          { key: 'price', header: 'Price', render: (e) => <span className="t-num">{eventPrice(e)}</span>, hideOnMobile: true },
          { key: 'status', header: 'Status', mobile: 'status', render: (e) => <StatusBadge status={e.status} /> },
          { key: 'actions', header: '', align: 'right', mobile: 'actions', render: (e) => (
            // Phones: a 2-up grid of full-width 44px buttons at the bottom of the card. Desktop: one compact row.
            <span className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2 md:inline-flex md:flex-wrap md:justify-end md:gap-1">
              <button className="btn-secondary !px-3 !text-xs" onClick={() => edit(e)}><Pencil className="size-3.5" aria-hidden />Edit<span className="sr-only"> {e.title}</span></button>
              {e.status === 'draft' && <button className="btn-primary !px-3 !text-xs" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: e.id, status: 'published' })}>Publish</button>}
              {e.status === 'published' && <button className="btn-secondary !px-3 !text-xs" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: e.id, status: 'closed' })}>Close</button>}
              {/* Only open events are worth forwarding: drafts are hidden and closed events take no registrations. */}
              {e.status === 'published' && <button className="btn-secondary !px-3 !text-xs" onClick={() => setSharing(e)}><Share2 className="size-3.5" aria-hidden />Share<span className="sr-only"> {e.title}</span></button>}
              <Link className="btn-secondary !px-3 !text-xs" to={`/admin/events/${e.id}`}><BarChart3 className="size-3.5" aria-hidden />Report<span className="sr-only">, registrations for {e.title}</span></Link>
            </span>
          ) },
        ]} />
      {sharing && (
        <Modal open onClose={() => setSharing(null)} title={`Share ${sharing.title}`} size="sm" description="Opens WhatsApp with this message; pick as many groups as you like there."
          footer={<><Button variant="secondary" onClick={() => copy(sharing)} icon={<Copy className="size-4" aria-hidden />}>Copy text</Button><Button onClick={() => void share({ title: sharing.title, text: eventText(sharing) })} icon={<MessageCircle className="size-4" aria-hidden />}>Share to WhatsApp</Button></>}>
          <pre className="card-sunken whitespace-pre-wrap break-words p-4 font-sans text-sm text-text-secondary">{eventText(sharing)}</pre>
        </Modal>
      )}
      <Modal open={open} onClose={close} variant="drawer" size="lg" title={editing ? `Edit event #${editing}` : 'New event'} description="Published events are visible and open for registration immediately."
        footer={<><Button variant="secondary" onClick={close} type="button">Cancel</Button><Button form="event-form" type="submit" loading={save.isPending}>{editing ? 'Save changes' : 'Create event'}</Button></>}>
        {/* One column on phones, two from lg; native date-time picker; Save is in the sheet's pinned footer. */}
        <form id="event-form" className="grid gap-4 lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <LabeledInput label="Title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <LabeledInput label="Venue" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} />
          <div className="lg:col-span-2"><LabeledTextarea label="Description" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <LabeledInput label="Starts" type="datetime-local" required value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} />
          <LabeledSelect label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option>draft</option><option>published</option><option>closed</option></LabeledSelect>
          <LabeledInput label="Capacity" type="number" inputMode="numeric" enterKeyHint="next" min="1" step="1" required value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
          <LabeledInput label="Member price ₹ (0 = free)" type="number" inputMode="decimal" enterKeyHint="next" min="0" step="0.01" required value={f.member_price} onChange={(e) => setF({ ...f, member_price: e.target.value })} />
          <LabeledInput label="Non-member price ₹ (0 = free)" type="number" inputMode="decimal" enterKeyHint="done" min="0" step="0.01" required disabled={f.members_only} value={f.non_member_price} onChange={(e) => setF({ ...f, non_member_price: e.target.value })}
            hint={f.members_only ? 'Not used: only members can register.' : undefined} />
          <label className="inline-flex min-h-12 cursor-pointer items-center gap-3 self-end rounded-full border border-border-strong px-4 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft lg:col-span-2 lg:justify-self-start">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={f.members_only} onChange={(e) => setF({ ...f, members_only: e.target.checked })} />
            Members only<span className="t-caption">non-members are asked to join first</span>
          </label>
          <LabeledInput label="Category (optional)" placeholder="Technical, Non-Technical…" maxLength={100} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <LabeledInput label="Duration (optional)" placeholder="3 hours" maxLength={60} value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} />
          <div className="lg:col-span-2"><LabeledInput label="Participation (optional)" placeholder="Teams of 2–4, Individual…" maxLength={120} value={f.participation} onChange={(e) => setF({ ...f, participation: e.target.value })} /></div>
          <fieldset className="grid gap-4 rounded-[var(--radius-lg)] border border-border p-4 lg:col-span-2 lg:grid-cols-[1fr_12rem]">
            <legend className="t-label px-1">Cover photo</legend>
            <div className="space-y-4">
              <LabeledInput label="Photo URL" placeholder="/media/past/my-event.jpg or https://…" maxLength={500} value={f.image_url} onChange={(e) => setF({ ...f, image_url: e.target.value })}
                hint="A file in frontend/public/media (run npm run photos:prepare for it) or an https link. Leave empty for no photo." />
              <LabeledInput label="Alt text" placeholder="What the photo shows" maxLength={300} disabled={!f.image_url} value={f.image_alt} onChange={(e) => setF({ ...f, image_alt: e.target.value })} />
            </div>
            {f.image_url ? <EventPhoto event={{ title: f.title, image_url: f.image_url, image_alt: f.image_alt }} className="aspect-[4/3] self-start rounded-[var(--radius-md)] border border-border" sizes="12rem" /> : <div className="card-sunken grid aspect-[4/3] place-items-center self-start t-caption">No photo</div>}
          </fieldset>
          <ErrorState error={save.error} className="lg:col-span-2" />
        </form>
      </Modal>
    </>
  );
}
