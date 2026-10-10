import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarDays, ClipboardList, Megaphone, QrCode, Receipt, Ticket, UserRound, Users, Wallet } from 'lucide-react';
import { get } from '@/api/client';
import type { Announcement, Event, Expense, Fundraiser, Member, Summary } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { MetricCard } from '@/components/MetricCard';
import { FeatureCard } from '@/components/FeatureCard';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState';
import { date, datetime, money } from '@/components/format';

/**
 * Role-aware dashboard. Every number comes from an existing endpoint; modules the caller
 * cannot access are simply not queried (enabled: false) rather than shown empty.
 */
export function DashboardPage() {
  const { me, has } = useAuth();
  const admin = has('admin'), treasurer = has('treasurer'), volunteer = has('volunteer');
  const staff = admin || treasurer;
  // The task board (/volunteer/tasks) is volunteer/treasurer only; plain members must not be linked to it.
  const taskBoard = volunteer || treasurer;

  const members = useQuery({ queryKey: ['members', 'all'], queryFn: () => get<Member[]>('/members'), enabled: staff });
  const expiring = useQuery({ queryKey: ['members', 'expiring'], queryFn: () => get<Member[]>('/members?expiring_within_days=14'), enabled: staff });
  const events = useQuery({ queryKey: ['events'], queryFn: () => get<Event[]>('/events') });
  const summary = useQuery({ queryKey: ['finance', 'summary', ''], queryFn: () => get<Summary>('/finance/summary') });
  const frs = useQuery({ queryKey: ['fundraisers'], queryFn: () => get<Fundraiser[]>('/fundraisers') });
  const queue = useQuery({ queryKey: ['expenses', 'submitted'], queryFn: () => get<Expense[]>('/expenses?status=submitted'), enabled: treasurer });
  const news = useQuery({ queryKey: ['announcements'], queryFn: () => get<Announcement[]>('/announcements') });

  if (!me) return null;
  const upcoming = (events.data ?? []).filter((e) => e.status === 'published' && new Date(e.starts_at) >= new Date()).sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  const next = upcoming[0];
  const activeMembers = members.data?.filter((m) => m.membership_status === 'active').length;
  const overdue = frs.data?.reduce((s, f) => s + f.tasks_overdue, 0) ?? 0;
  const seatsSold = upcoming.reduce((s, e) => s + (e.capacity - e.seats_left), 0);
  const seatsLeft = upcoming.reduce((s, e) => s + e.seats_left, 0);
  const flagged = queue.data?.filter((x) => x.flags.length).length ?? 0;
  const firstName = me.user.name.split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const attention: { icon: typeof Users; text: string; to: string; tone: 'warning' | 'danger' | 'info' }[] = [];
  if (expiring.data?.length) attention.push({ icon: Users, text: `${expiring.data.length} membership${expiring.data.length === 1 ? '' : 's'} expire within 14 days`, to: '/admin/members', tone: 'warning' });
  if (queue.data?.length) attention.push({ icon: Receipt, text: `${queue.data.length} reimbursement${queue.data.length === 1 ? '' : 's'} awaiting review${flagged ? ` · ${flagged} flagged` : ''}`, to: '/treasurer/expenses', tone: flagged ? 'danger' : 'warning' });
  if (overdue && taskBoard) attention.push({ icon: ClipboardList, text: `${overdue} overdue task${overdue === 1 ? '' : 's'} across fundraisers`, to: '/volunteer/tasks', tone: 'danger' });
  if (!me.active && me.member) attention.push({ icon: UserRound, text: 'Your membership is not active. Pay dues to unlock member pricing.', to: '/me', tone: 'info' });
  const pendingTickets = me.tickets.filter((t) => t.status === 'pending').length;
  if (pendingTickets) attention.push({ icon: Ticket, text: `${pendingTickets} ticket${pendingTickets === 1 ? '' : 's'} awaiting payment confirmation`, to: '/me', tone: 'warning' });

  const months = (summary.data?.by_month ?? []).reduce<Record<string, { in: number; out: number }>>((acc, r) => { (acc[r.month] ??= { in: 0, out: 0 })[r.direction as 'in' | 'out'] = r.total; return acc; }, {});
  const series = Object.entries(months).slice(-6);
  const max = Math.max(1, ...series.flatMap(([, v]) => [v.in, v.out]));

  return (
    <>
      <PageHeader eyebrow={<>{me.user.role} · {date(new Date().toISOString())}</>} title={`${greeting}, ${firstName}`} description="Here's where the association stands right now." />

      {/* Feature row: next event (hero) + balance */}
      <div className="grid gap-4 lg:grid-cols-5">
        <FeatureCard className="lg:col-span-3 min-h-[260px]" eyebrow={next ? <>Next event · {datetime(next.starts_at)}</> : 'Events'}
          title={events.isLoading ? <span className="skeleton inline-block h-8 w-56 align-middle" /> : next ? next.title : 'No upcoming events'}
          description={next ? (next.venue ? `${next.venue}. ` : '') + (next.description ?? '') : admin ? 'Publish an event to start selling tickets.' : 'Check back soon.'}
          aside={next && <StatusBadge status={next.status} />}
          footer={next ? (<>
            <Link to={`/events/${next.id}`} className="btn-primary">{admin ? 'View event' : next.price_for_you === 0 ? 'Get free ticket' : `Buy · ${money(next.price_for_you)}`}<ArrowRight className="size-4" aria-hidden /></Link>
            {volunteer && <Link to="/volunteer/scan" className="btn-secondary"><QrCode className="size-4" aria-hidden />Open scanner</Link>}
            {admin && <Link to={`/admin/events/${next.id}/report`} className="btn-ghost">Report</Link>}
          </>) : admin ? <Link to="/admin/events" className="btn-primary">Create event</Link> : <Link to="/events" className="btn-secondary">Browse events</Link>}>
          {next && (
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Sold" value={next.capacity - next.seats_left} />
              <Stat label="Seats left" value={next.seats_left} />
              <Stat label="Capacity" value={next.capacity} />
              <div className="col-span-3 h-1.5 overflow-hidden rounded-full bg-black/40" role="progressbar" aria-valuenow={next.capacity - next.seats_left} aria-valuemax={next.capacity} aria-label="Seats sold">
                <div className="h-full rounded-full bg-text-primary" style={{ width: `${Math.round(((next.capacity - next.seats_left) / next.capacity) * 100)}%` }} />
              </div>
            </div>
          )}
        </FeatureCard>

        <FeatureCard className="lg:col-span-2" glow="corner" eyebrow="Club balance" title={summary.isLoading ? <span className="skeleton inline-block h-8 w-40 align-middle" /> : summary.error ? '—' : money(summary.data?.balance)} description={summary.error ? undefined : <>In {money(summary.data?.total_in)} · Out {money(summary.data?.total_out)}</>}
          footer={<Link to={treasurer ? '/treasurer' : '/finance'} className="btn-secondary"><Wallet className="size-4" aria-hidden />{treasurer ? 'Treasurer desk' : 'Full summary'}</Link>}>
          {summary.error ? <ErrorState error={summary.error} onRetry={() => summary.refetch()} /> : series.length > 0 && (
            <figure className="mt-1">
              <div className="flex h-20 items-end gap-1.5" role="img" aria-label={`Monthly income and spending for the last ${series.length} months`}>
                {series.map(([m, v]) => (
                  <div key={m} className="flex flex-1 items-end gap-0.5" title={`${m}: in ${money(v.in)}, out ${money(v.out)}`}>
                    <span className="flex-1 rounded-sm bg-accent" style={{ height: `${Math.max(3, (v.in / max) * 100)}%` }} />
                    <span className="flex-1 rounded-sm bg-text-tertiary/60" style={{ height: `${Math.max(3, (v.out / max) * 100)}%` }} />
                  </div>
                ))}
              </div>
              <figcaption className="mt-2 flex justify-between t-label"><span>{series[0][0]}</span><span><span className="inline-block size-2 rounded-sm bg-accent align-middle" /> in <span className="ml-2 inline-block size-2 rounded-sm bg-text-tertiary/60 align-middle" /> out</span><span>{series[series.length - 1][0]}</span></figcaption>
            </figure>
          )}
        </FeatureCard>
      </div>

      {/* Metric row */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {staff && <MetricCard label="Active members" icon={Users} loading={members.isLoading} value={activeMembers ?? '—'} hint={members.data ? `${members.data.length} profiles` : undefined} />}
        {staff && <MetricCard label="Renewals due" icon={UserRound} loading={expiring.isLoading} value={expiring.data?.length ?? '—'} hint="next 14 days" tone={(expiring.data?.length ?? 0) > 0 ? 'warning' : 'default'} />}
        <MetricCard label="Upcoming events" icon={CalendarDays} loading={events.isLoading} value={upcoming.length} hint={`${seatsSold} sold · ${seatsLeft} left`} />
        <MetricCard label={treasurer ? 'Review queue' : 'Open tasks'} icon={treasurer ? Receipt : ClipboardList} loading={treasurer ? queue.isLoading : frs.isLoading}
          value={treasurer ? queue.data?.length ?? '—' : frs.data ? frs.data.reduce((s, f) => s + (f.tasks_total - f.tasks_done), 0) : '—'}
          hint={treasurer ? (flagged ? `${flagged} flagged` : 'nothing flagged') : overdue ? `${overdue} overdue` : 'none overdue'} tone={treasurer ? (flagged ? 'danger' : 'default') : overdue ? 'danger' : 'default'} />
        {!staff && <MetricCard label="My tickets" icon={Ticket} value={me.tickets.length} hint={me.active ? 'member pricing on' : 'standard pricing'} />}
        {!staff && <MetricCard label="Membership" icon={UserRound} value={me.active ? 'Active' : me.member ? 'Inactive' : 'None'} hint={me.membership?.expiry_date ? `until ${date(me.membership.expiry_date)}` : undefined} tone={me.active ? 'default' : 'warning'} />}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Needs attention */}
        <section className="lg:col-span-1">
          <SectionHeader title="Needs attention" meta={attention.length ? `${attention.length}` : undefined} />
          {attention.length === 0 ? <EmptyState title="All clear" description="Nothing is overdue, expiring or waiting on you." /> : (
            <ul className="card !p-2 divide-y divide-border">
              {attention.map((a, i) => (
                <li key={i}><Link to={a.to} className="interactive flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-3 hover:bg-surface-elevated">
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${a.tone === 'danger' ? 'bg-danger-soft text-danger' : a.tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-accent-soft text-accent'}`}><a.icon className="size-4" aria-hidden /></span>
                  <span className="flex-1 text-sm">{a.text}</span><ArrowRight className="size-4 text-text-tertiary" aria-hidden />
                </Link></li>
              ))}
            </ul>
          )}
        </section>

        {/* Upcoming events list */}
        <section>
          <SectionHeader title="Upcoming" actions={<Link to="/events" className="t-label hover:text-accent">All events →</Link>} />
          {events.isLoading ? <div className="card"><Skeleton rows={4} /></div> : events.error ? <ErrorState error={events.error} onRetry={() => events.refetch()} /> : upcoming.length === 0 ? <EmptyState title="No events scheduled" /> : (
            <ul className="card !p-2 divide-y divide-border">
              {upcoming.slice(0, 5).map((e) => (
                <li key={e.id}><Link to={`/events/${e.id}`} className="interactive flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 hover:bg-surface-elevated">
                  <span className="card-sunken flex w-11 shrink-0 flex-col items-center py-1" aria-hidden><span className="t-label !text-[9px]">{new Date(e.starts_at).toLocaleDateString('en-IN', { month: 'short' })}</span><span className="font-display text-lg leading-none">{new Date(e.starts_at).getDate()}</span></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{e.title}</span><span className="block truncate t-caption">{e.seats_left === 0 ? 'Sold out' : `${e.capacity - e.seats_left}/${e.capacity} sold`} · {money(e.price_for_you)}</span></span>
                </Link></li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent announcements + fundraiser progress */}
        <section className="space-y-6">
          <div>
            <SectionHeader title="Announcements" actions={<Link to="/announcements" className="t-label hover:text-accent">Archive →</Link>} />
            {news.isLoading ? <div className="card"><Skeleton rows={3} /></div> : !news.data?.length ? <EmptyState title="Nothing posted yet" icon={<Megaphone className="size-5" aria-hidden />} /> : (
              <ul className="card !p-2 divide-y divide-border">{news.data.slice(0, 3).map((a) => <li key={a.id} className="px-3 py-2.5"><div className="truncate text-sm font-medium">{a.title}</div><div className="t-caption font-mono">{datetime(a.published_at)} · {a.author_name}</div></li>)}</ul>
            )}
          </div>
          {frs.data && frs.data.length > 0 && (
            <div>
              <SectionHeader title="Fundraisers" actions={taskBoard && <Link to={admin ? '/admin/fundraisers' : '/volunteer/tasks'} className="t-label hover:text-accent">Open →</Link>} />
              <ul className="card !p-4 space-y-3">
                {frs.data.filter((f) => f.status !== 'closed').slice(0, 3).map((f) => (
                  <li key={f.id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm"><span className="truncate font-medium">{f.name}</span><span className="t-caption t-num shrink-0">{money(f.raised)} / {money(f.target_amount)}</span></div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-elevated" role="progressbar" aria-valuenow={Math.round((f.progress ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${f.name} progress`}><div className="h-full rounded-full bg-success" style={{ width: `${Math.round((f.progress ?? 0) * 100)}%` }} /></div>
                    {f.tasks_overdue > 0 && <div className="mt-1 inline-flex items-center gap-1 text-xs text-danger"><AlertTriangle className="size-3" aria-hidden />{f.tasks_overdue} overdue</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[var(--radius-md)] bg-black/30 px-3 py-2 backdrop-blur-sm"><div className="t-label !text-text-secondary">{label}</div><div className="t-metric !text-2xl mt-0.5">{value}</div></div>;
}
