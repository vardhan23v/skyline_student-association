import { useQuery } from '@tanstack/react-query';
import { get } from '@/api/client';
import type { Announcement } from '@/api/types';
import { Empty, PageTitle, datetime } from '@/components/ui';

export function AnnouncementsPage() {
  const q = useQuery({ queryKey: ['announcements'], queryFn: () => get<Announcement[]>('/announcements') });
  return (
    <>
      <PageTitle title="Announcements" sub="Timestamped archive. Members-only posts appear when you are logged in with an active membership." />
      {q.isLoading ? 'Loading…' : !q.data?.length ? <Empty>Nothing posted yet.</Empty> : (
        <div className="space-y-4">{q.data.map((a) => (
          <article key={a.id} className="card">
            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>{datetime(a.published_at)} · {a.author_name}</span><span>{a.audience === 'members' ? '🔒 members' : '🌐 everyone'}{a.email_recipient_count != null && ` · emailed to ${a.email_recipient_count}`}</span></div>
            <h3 className="font-semibold text-lg mt-1">{a.title}</h3>
            <p className="mt-2 whitespace-pre-wrap text-slate-700 text-sm">{a.body}</p>
          </article>
        ))}</div>
      )}
    </>
  );
}
