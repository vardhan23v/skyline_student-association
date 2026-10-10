import { useQuery } from '@tanstack/react-query';
import { Globe, Lock, Mail, Megaphone } from 'lucide-react';
import { get } from '@/api/client';
import type { Announcement } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState';
import { datetime } from '@/components/format';
import { Link } from 'react-router-dom';

export function AnnouncementsPage() {
  const { me, has } = useAuth();
  const q = useQuery({ queryKey: ['announcements'], queryFn: () => get<Announcement[]>('/announcements') });
  return (
    <>
      <PageHeader eyebrow="Announcements" title="Archive" description={me?.is_member || has('admin') ? 'Everything posted, newest first, including members-only updates.' : 'Members-only posts appear when you are logged in with an active membership.'}
        actions={has('admin') && <Link to="/admin?tab=announcements" className="btn-primary"><Megaphone className="size-4" aria-hidden />Compose</Link>} />
      {q.isLoading ? <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="card"><Skeleton rows={3} /></div>)}</div> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyState icon={<Megaphone className="size-5" aria-hidden />} title="Nothing posted yet" description="Announcements appear here and go out by email at the same time." />
      ) : (
        <ol className="relative space-y-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-border md:pl-8" aria-label="Posts">
          {q.data.map((a) => (
            <li key={a.id} className="relative">
              <span className="absolute -left-8 top-5 hidden size-[7px] rounded-full bg-accent ring-4 ring-background md:block" aria-hidden />
              <article className="card">
                <div className="flex flex-wrap items-center justify-between gap-2 t-label">
                  <span>{datetime(a.published_at)} · {a.author_name}</span>
                  <span className="inline-flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">{a.audience === 'members' ? <Lock className="size-3" aria-hidden /> : <Globe className="size-3" aria-hidden />}{a.audience === 'members' ? 'members' : 'everyone'}</span>
                    {a.email_recipient_count != null && <span className="inline-flex items-center gap-1"><Mail className="size-3" aria-hidden />{a.email_recipient_count}</span>}
                  </span>
                </div>
                <h2 className="t-section mt-2 text-lg">{a.title}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{a.body}</p>
              </article>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
