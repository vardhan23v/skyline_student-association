import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Globe, Lock, Mail, Megaphone, Share2 } from 'lucide-react';
import { get } from '@/api/client';
import type { Announcement } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState';
import { datetime } from '@/components/format';
import { IconButton } from '@/components/Button';
import { announcementText, share } from '@/lib/share';
import { Link, useLocation } from 'react-router-dom';

export function AnnouncementsPage() {
  const { me, has } = useAuth();
  const q = useQuery({ queryKey: ['announcements'], queryFn: () => get<Announcement[]>('/announcements') });
  // Shared links end in #a-<id>: once the posts are on screen, bring that one into view and flash it.
  const { hash } = useLocation();
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!q.data || !/^#a-\d+$/.test(hash)) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setFlash(hash.slice(1));
    const t = window.setTimeout(() => setFlash(null), 2400);
    return () => window.clearTimeout(t);
  }, [q.data, hash]);
  return (
    <>
      <PageHeader script="latest" title="News" description={me?.is_member || has('admin') ? 'Everything posted, newest first, including members-only updates.' : 'Members-only posts appear when you are logged in with an active membership.'}
        actions={has('admin') && <Link to="/admin?tab=announcements" className="btn-primary"><Megaphone className="size-4" aria-hidden />Compose</Link>} />
      {q.isLoading ? <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="card"><Skeleton rows={3} /></div>)}</div> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyState icon={<Megaphone className="size-5" aria-hidden />} title="Nothing posted yet" description="Announcements appear here and go out by email at the same time." />
      ) : (
        <ol className="relative space-y-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-border md:pl-8" aria-label="Posts">
          {q.data.map((a) => (
            <li key={a.id} id={`a-${a.id}`} className="relative scroll-mt-28">
              <span className="absolute -left-8 top-5 hidden size-[7px] rounded-full bg-accent ring-4 ring-background md:block" aria-hidden />
              <article className={`card transition-shadow duration-500 ${flash === `a-${a.id}` ? 'ring-2 ring-accent ring-offset-2 ring-offset-background' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 t-label">
                  <span>{datetime(a.published_at)} · {a.author_name}</span>
                  <span className="inline-flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">{a.audience === 'members' ? <Lock className="size-3" aria-hidden /> : <Globe className="size-3" aria-hidden />}{a.audience === 'members' ? 'members' : 'everyone'}</span>
                    {a.email_recipient_count != null && <span className="inline-flex items-center gap-1"><Mail className="size-3" aria-hidden />{a.email_recipient_count}</span>}
                  </span>
                </div>
                <div className="mt-1 flex items-start justify-between gap-2">
                  <h2 className="t-section mt-1 min-w-0 text-lg">{a.title}</h2>
                  <IconButton label="Share on WhatsApp" className="-mr-2 shrink-0" onClick={() => void share({ title: a.title, text: announcementText(a) })}><Share2 className="size-4" aria-hidden /></IconButton>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{a.body}</p>
              </article>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
