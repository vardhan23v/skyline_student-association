import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Lock } from 'lucide-react';
import { get } from '@/api/client';
import type { Summary } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { MetricCard } from '@/components/MetricCard';
import { LabeledInput } from '@/components/Input';
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState';
import { money, compact } from '@/components/format';

const tip = { contentStyle: { background: 'var(--surface-elevated)', border: '1px solid var(--border-strong)', borderRadius: 12, fontSize: 12 }, labelStyle: { color: 'var(--text-secondary)' }, itemStyle: { color: 'var(--text-primary)' }, cursor: { fill: 'rgba(255,255,255,0.03)' } };

/** Read-only transparency view for any logged-in member. Calm, tabular, no decoration beyond the chart. */
export function FinancePublicPage() {
  const { me } = useAuth();
  const [period, setPeriod] = useState({ from: '', to: '' });
  const qs = new URLSearchParams(Object.entries(period).filter(([, v]) => v)).toString();
  const q = useQuery({ queryKey: ['finance', 'summary', qs], queryFn: () => get<Summary>(`/finance/summary${qs ? `?${qs}` : ''}`), enabled: !!me });
  if (!me) return <EmptyState icon={<Lock className="size-5" aria-hidden />} title="Members-only" description="Club finances are visible to logged-in members. Every rupee in and out comes from the append-only ledger." action={<Link to="/login" className="btn-primary">Log in</Link>} />;
  const s = q.data;
  const cat = (d: string) => (s?.by_category ?? []).filter((r) => r.direction === d);
  const months = Object.values((s?.by_month ?? []).reduce<Record<string, { month: string; in: number; out: number }>>((acc, r) => { acc[r.month] ??= { month: r.month, in: 0, out: 0 }; acc[r.month][r.direction as 'in' | 'out'] = r.total; return acc; }, {}));
  const group = <T extends { direction: string; total: number }>(rows: T[], key: (r: T) => string | number) => Array.from(new Map(rows.map((r) => [key(r), rows.filter((x) => key(x) === key(r))])).values());
  return (
    <>
      <PageHeader eyebrow="Finance · transparency" title="Club finances" description="Derived from the append-only ledger. Nothing here is typed in by hand."
        actions={<div className="flex gap-2"><LabeledInput label="From" type="date" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} className="!w-40" /><LabeledInput label="To" type="date" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} className="!w-40" /></div>} />
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
        <MetricCard label="Balance" loading={q.isLoading} value={money(s?.balance)} tone="accent" />
        <MetricCard label="Total in" loading={q.isLoading} value={money(s?.total_in)} />
        <MetricCard label="Total out" loading={q.isLoading} value={money(s?.total_out)} />
      </div>
      {s && (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className="card">
            <SectionHeader title="By month" meta="in vs out" />
            {months.length === 0 ? <p className="t-caption">No entries in this period.</p> : (
              <div className="h-60" role="img" aria-label="Bar chart of monthly income and spending">
                <ResponsiveContainer width="100%" height="100%"><BarChart data={months} barGap={2}><CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="month" tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(v) => compact(v)} tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={40} /><Tooltip {...tip} formatter={(v: number) => money(v)} /><Bar dataKey="in" name="In" fill="var(--accent)" radius={[3, 3, 0, 0]} /><Bar dataKey="out" name="Out" fill="var(--text-tertiary)" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
              </div>
            )}
          </section>
          <section className="card">
            <SectionHeader title="By category" />
            <table className="table"><thead><tr><th scope="col">Category</th><th scope="col" className="text-right">In</th><th scope="col" className="text-right">Out</th></tr></thead><tbody>
              {Array.from(new Set(s.by_category.map((r) => r.category))).map((c) => <tr key={c}><td className="capitalize">{c}</td><td className="text-right t-num text-success">{money(cat('in').find((r) => r.category === c)?.total)}</td><td className="text-right t-num">{money(cat('out').find((r) => r.category === c)?.total)}</td></tr>)}
            </tbody></table>
          </section>
          <section className="card">
            <SectionHeader title="By event" />
            {s.by_event.length === 0 ? <p className="t-caption">No event-linked entries.</p> : <table className="table"><thead><tr><th scope="col">Event</th><th scope="col" className="text-right">Revenue</th><th scope="col" className="text-right">Spent</th></tr></thead><tbody>
              {group(s.by_event, (r) => r.event_id).map((rows) => <tr key={rows[0].event_id}><td>{rows[0].title}</td><td className="text-right t-num text-success">{money(rows.find((r) => r.direction === 'in')?.total)}</td><td className="text-right t-num">{money(rows.find((r) => r.direction === 'out')?.total)}</td></tr>)}
            </tbody></table>}
          </section>
          <section className="card">
            <SectionHeader title="By fundraiser" />
            {s.by_fundraiser.length === 0 ? <p className="t-caption">No fundraiser-linked entries.</p> : <table className="table"><thead><tr><th scope="col">Fundraiser</th><th scope="col" className="text-right">Raised</th><th scope="col" className="text-right">Target</th><th scope="col" className="text-right">Spent</th></tr></thead><tbody>
              {group(s.by_fundraiser, (r) => r.fundraiser_id).map((rows) => <tr key={rows[0].fundraiser_id}><td>{rows[0].name}</td><td className="text-right t-num text-success">{money(rows.find((r) => r.direction === 'in')?.total)}</td><td className="text-right t-num">{money(rows[0].target_amount)}</td><td className="text-right t-num">{money(rows.find((r) => r.direction === 'out')?.total)}</td></tr>)}
            </tbody></table>}
          </section>
        </div>
      )}
      {q.isLoading && <div className="card mt-6"><Skeleton rows={6} /></div>}
    </>
  );
}
