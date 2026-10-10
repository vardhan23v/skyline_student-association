import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Lock, Mail, Send } from 'lucide-react';
import { get, post } from '@/api/client';
import type { Announcement } from '@/api/types';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { LabeledInput, LabeledSelect, LabeledTextarea } from '@/components/Input';
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { datetime } from '@/components/format';

/** Compose + archive. Publishing emails the audience, so it goes through a confirm step. */
export function AdminAnnouncementsPage() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['announcements'], queryFn: () => get<Announcement[]>('/announcements') });
  const [f, setF] = useState({ title: '', body: '', audience: 'all' });
  const [confirm, setConfirm] = useState(false);
  const closeConfirm = () => setConfirm(false);
  const pub = useMutation({ mutationFn: () => post<Announcement>('/admin/announcements', f), onSuccess: (a) => { setF({ title: '', body: '', audience: 'all' }); setConfirm(false); qc.invalidateQueries({ queryKey: ['announcements'] }); toast.success('Published', `Emailed to ${a.email_recipient_count ?? 0} recipients.`); }, onError: () => setConfirm(false) });
  return (
    <>
      <PageHeader eyebrow="Announcements" title="Compose" description="One post goes to the website archive and the mailing list together. Published posts are permanent." />
      <div className="grid gap-5 lg:grid-cols-5">
        <form className="card space-y-4 lg:col-span-3" onSubmit={(e) => { e.preventDefault(); setConfirm(true); }}>
          <LabeledInput label="Title" required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <LabeledTextarea label="Body" rows={10} required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} hint={`${f.body.length} characters · line breaks are kept`} />
          <LabeledSelect label="Audience" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="all">Everyone</option><option value="members">Active members only</option></LabeledSelect>
          <ErrorState error={pub.error} />
          <Button type="submit" className="w-full" icon={<Send className="size-4" aria-hidden />}>Publish & email</Button>
        </form>
        <section className="lg:col-span-2">
          <SectionHeader title="Archive" meta={q.data ? `${q.data.length}` : undefined} />
          {q.isLoading ? <div className="card"><Skeleton rows={4} /></div> : !q.data?.length ? <EmptyState title="Nothing published yet" /> : (
            <ol className="card !p-2 divide-y divide-border">{q.data.map((a) => <li key={a.id} className="px-3 py-3"><div className="text-sm font-medium">{a.title}</div><div className="mt-1 flex flex-wrap gap-x-3 t-caption font-mono"><span>{datetime(a.published_at)}</span><span className="inline-flex items-center gap-1">{a.audience === 'members' ? <Lock className="size-3" aria-hidden /> : <Globe className="size-3" aria-hidden />}{a.audience}</span><span className="inline-flex items-center gap-1"><Mail className="size-3" aria-hidden />{a.email_recipient_count ?? 0}</span></div></li>)}</ol>
          )}
        </section>
      </div>
      <Modal open={confirm} onClose={closeConfirm} title="Publish this announcement?" size="sm" description="It will be emailed immediately and cannot be edited afterwards."
        footer={<><Button variant="secondary" disabled={pub.isPending} onClick={closeConfirm}>Keep editing</Button><Button loading={pub.isPending} onClick={() => pub.mutate()} icon={<Send className="size-4" aria-hidden />}>Publish to {f.audience === 'all' ? 'everyone' : 'active members'}</Button></>}>
        <div className="card-sunken p-4"><div className="font-medium">{f.title}</div><p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-text-secondary">{f.body}</p></div>
      </Modal>
    </>
  );
}
