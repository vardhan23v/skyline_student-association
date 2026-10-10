import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowRight, BookOpen, Receipt, Wallet, BarChart3 } from 'lucide-react';
import { get } from '@/api/client';
import type { Expense, LedgerRow, Summary } from '@/api/types';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { MetricCard } from '@/components/MetricCard';
import { TransactionRow } from '@/components/TransactionRow';
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState';
import { money } from '@/components/format';

/* Greyscale ramp + one accent, as in the reference; category identity comes from the legend text. */
const palette = ['var(--accent)', '#9aa6c2', '#5f6b88', '#3a4461', '#c7d0e6', '#7cc4ff'];
const tip = { contentStyle: { background: 'var(--surface-elevated)', border: '1px solid var(--border-strong)', borderRadius: 12, fontSize: 12 }, itemStyle: { color: 'var(--text-primary)' } };

export function TreasurerHome() {
  const s = useQuery({ queryKey: ['finance', 'summary', ''], queryFn: () => get<Summary>('/finance/summary') });
  const queue = useQuery({ queryKey: ['expenses', 'submitted'], queryFn: () => get<Expense[]>('/expenses?status=submitted') });
  const recent = useQuery({ queryKey: ['ledger', 'limit=8'], queryFn: () => get<LedgerRow[]>('/finance/ledger?limit=8') });
  const pie = (d: string) => (s.data?.by_category ?? []).filter((r) => r.direction === d).map((r) => ({ name: r.category, value: r.total }));
  const flagged = queue.data?.filter((x) => x.flags.length).length ?? 0;
  const Donut = ({ title, data }: { title: string; data: { name: string; value: number }[] }) => (
    <section className="card">
      <SectionHeader title={title} as="h3" />
      {data.length === 0 ? <p className="t-caption">No entries.</p> : (
        <div className="flex items-center gap-4">
          <div className="h-36 w-36 shrink-0" role="img" aria-label={`${title}: ${data.map((d) => `${d.name} ${money(d.value)}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} stroke="var(--surface)" strokeWidth={2}>{data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}</Pie><Tooltip {...tip} formatter={(v: number) => money(v)} /></PieChart></ResponsiveContainer>
          </div>
          <ul className="min-w-0 flex-1 space-y-1.5 text-sm">{data.map((d, i) => <li key={d.name} className="flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-sm" style={{ background: palette[i % palette.length] }} aria-hidden /><span className="flex-1 truncate capitalize">{d.name}</span><span className="t-num text-text-secondary">{money(d.value)}</span></li>)}</ul>
        </div>
      )}
    </section>
  );
  return (
    <>
      <PageHeader eyebrow="Treasurer" title="Treasurer desk" description="Finance writes require the treasurer role. Admins cannot touch the ledger." />
      <ErrorState error={s.error} onRetry={() => s.refetch()} className="mb-4" />
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <MetricCard label="Balance" icon={Wallet} loading={s.isLoading} value={money(s.data?.balance)} tone="accent" />
        <MetricCard label="Total in" loading={s.isLoading} value={money(s.data?.total_in)} />
        <MetricCard label="Total out" loading={s.isLoading} value={money(s.data?.total_out)} />
        <MetricCard label="Review queue" icon={Receipt} loading={queue.isLoading} value={queue.data?.length ?? '—'} hint={flagged ? `${flagged} flagged` : 'nothing flagged'} tone={flagged ? 'danger' : (queue.data?.length ?? 0) > 0 ? 'warning' : 'default'} />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="grid gap-5 md:grid-cols-2"><Donut title="Income by category" data={pie('in')} /><Donut title="Spending by category" data={pie('out')} /></div>
          <section className="card">
            <SectionHeader title="Recent transactions" actions={<Link to="/treasurer/ledger" className="t-label hover:text-accent">Full ledger →</Link>} />
            {recent.isLoading ? <Skeleton rows={5} /> : recent.error ? <ErrorState error={recent.error} onRetry={() => recent.refetch()} /> : !recent.data?.length ? <EmptyState title="No ledger entries yet" className="!py-6" /> : <ul>{recent.data.map((r) => <TransactionRow key={r.id} row={r} />)}</ul>}
          </section>
        </div>
        <nav aria-label="Treasurer actions" className="space-y-3">
          {[['/treasurer/expenses', 'Expense review queue', Receipt, queue.data?.length ? `${queue.data.length} waiting` : 'Queue is clear'], ['/treasurer/ledger', 'Ledger & CSV export', BookOpen, 'Append-only, with reversals'], ['/treasurer/cash', 'Record cash', Wallet, 'Dues, door tickets, bake sales'], ['/finance', 'Public summary', BarChart3, 'What members see']].map(([to, t, Icon, d]: any) => (
            <Link key={to} to={to} className="card card-hover interactive group flex items-center gap-3 focus-ring"><span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent"><Icon className="size-4" aria-hidden /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{t}</span><span className="t-caption block">{d}</span></span><ArrowRight className="size-4 text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden /></Link>
          ))}
        </nav>
      </div>
    </>
  );
}
