import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/api/client';
import type { Announcement } from '@/api/types';
import { ErrorBox, Field, PageTitle, datetime } from '@/components/ui';

export function AdminAnnouncementsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['announcements'], queryFn: () => get<Announcement[]>('/announcements') });
  const [f, setF] = useState({ title: '', body: '', audience: 'all' });
  const pub = useMutation({ mutationFn: () => post<Announcement>('/announcements', f), onSuccess: () => { setF({ title: '', body: '', audience: 'all' }); qc.invalidateQueries({ queryKey: ['announcements'] }); } });
  return (
    <>
      <PageTitle title="Announcements" sub="One post → website archive + email to the audience. Published posts are permanent." />
      <div className="grid gap-6 lg:grid-cols-2">
        <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); pub.mutate(); }}>
          <Field label="Title"><input className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Body"><textarea className="input" rows={8} required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <Field label="Audience"><select className="input" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="all">Everyone</option><option value="members">Active members only</option></select></Field>
          <ErrorBox error={pub.error} />
          {pub.data && <div className="text-sm text-emerald-700">Published and emailed to {pub.data.email_recipient_count} recipients.</div>}
          <button className="btn-primary w-full" disabled={pub.isPending}>Publish & email</button>
        </form>
        <div className="card"><h3 className="font-semibold mb-2">Archive</h3><ul className="divide-y">{q.data?.map((a) => <li key={a.id} className="py-2"><div className="font-medium text-sm">{a.title}</div><div className="text-xs text-slate-500">{datetime(a.published_at)} · {a.audience} · emailed {a.email_recipient_count ?? 0}</div></li>)}</ul></div>
      </div>
    </>
  );
}
