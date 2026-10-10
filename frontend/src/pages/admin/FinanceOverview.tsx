import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Receipt, Wallet } from 'lucide-react';
import { get } from '@/api/client';
import type { Expense, LedgerRow, Summary } from '@/api/types';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { MetricCard } from '@/components/MetricCard';
import { TransactionRow } from '@/components/TransactionRow';
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState';
import { money } from '@/components/format';
import { LedgerPage } from './LedgerPage';
import { ExpenseQueuePage } from './ExpenseQueuePage';
import { SubmitExpensePage } from './SubmitExpensePage';

/* Crimson, then a cream ramp and flame: the site palette only. Category identity comes from the legend text. */
const palette = ['var(--accent)', 'rgba(246, 233, 206, 0.85)', 'var(--accent-text)', 'rgba(246, 233, 206, 0.5)', 'rgba(246, 233, 206, 0.28)', 'rgba(193, 18, 31, 0.55)'];
const tip = { contentStyle: { background: 'var(--surface-elevated)', border: '1px solid var(--border-strong)', borderRadius: 12, fontSize: 12 }, itemStyle: { color: 'var(--text-primary)' } };

/** Module-level so each FinanceSummary re-render doesn't create a new component type and remount the chart. */
function Donut({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <section className="card">
      <SectionHeader title={title} as="h3" />
      {data.length === 0 ? <p className="t-caption">No entries.</p> : (
        <div className="flex items-center gap-4">
          <div className="h-28 w-28 shrink-0 sm:h-36 sm:w-36" role="img" aria-label={`${title}: ${data.map((d) => `${d.name} ${money(d.value)}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="95%" stroke="var(--surface)" strokeWidth={2}>{data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}</Pie><Tooltip {...tip} formatter={(v: number) => money(v)} /></PieChart></ResponsiveContainer>
          </div>
          <ul className="min-w-0 flex-1 space-y-1.5 text-sm">{data.map((d, i) => <li key={d.name} className="flex min-w-0 items-center gap-2"><span className="size-2.5 shrink-0 rounded-sm" style={{ background: palette[i % palette.length] }} aria-hidden /><span className="min-w-0 flex-1 truncate capitalize">{d.name}</span><span className="shrink-0 t-num text-text-secondary">{money(d.value)}</span></li>)}</ul>
        </div>
      )}
    </section>
  );
}

const views = [
  { key: 'summary', label: 'Summary' },
  { key: 'ledger', label: 'Ledger & CSV' },
  { key: 'expenses', label: 'Expense review' },
  { key: 'submit', label: 'Submit expense' },
] as const;
type View = (typeof views)[number]['key'];

/** Admin › Finance tab: summary, ledger (with CSV export), expense review and submission, switched by `?view=`. */
export function FinanceOverview() {
  const [params, setParams] = useSearchParams();
  const view = (views.find((v) => v.key === params.get('view'))?.key ?? 'summary') as View;
  const go = (v: View) => setParams(v === 'summary' ? { tab: 'finance' } : { tab: 'finance', view: v });
  return (
    <>
      <div role="group" aria-label="Finance views" className="scroll-row fade-x -mx-4 mb-5 gap-2 px-4 md:mx-0 md:flex-wrap md:px-0 md:[mask-image:none]">
        {views.map((v) => <button key={v.key} type="button" aria-pressed={view === v.key} onClick={() => go(v.key)} className="chip">{v.label}</button>)}
      </div>
      {view === 'summary' && <FinanceSummary onOpen={go} />}
      {view === 'ledger' && <LedgerPage />}
      {view === 'expenses' && <ExpenseQueuePage />}
      {view === 'submit' && <SubmitExpensePage />}
    </>
  );
}

function FinanceSummary({ onOpen }: { onOpen: (v: View) => void }) {
  const s = useQuery({ queryKey: ['finance', 'summary', ''], queryFn: () => get<Summary>('/finance/summary') });
  const queue = useQuery({ queryKey: ['expenses', 'submitted'], queryFn: () => get<Expense[]>('/admin/expenses?status=submitted') });
  const recent = useQuery({ queryKey: ['ledger', 'limit=8'], queryFn: () => get<LedgerRow[]>('/admin/finance/ledger?limit=8') });
  const pie = (d: string) => (s.data?.by_category ?? []).filter((r) => r.direction === d).map((r) => ({ name: r.category, value: r.total }));
  const flagged = queue.data?.filter((x) => x.flags.length).length ?? 0;
  return (
    <>
      <PageHeader script="club" title="Finances" description="Every payment and reimbursement is in one append-only ledger. Members see the summary on the Finance page." />
      <ErrorState error={s.error} onRetry={() => s.refetch()} className="mb-4" />
      {/* Summary figures first: 2-up on phones, 4 from lg. */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <MetricCard label="Balance" icon={Wallet} loading={s.isLoading} value={money(s.data?.balance)} tone="accent" />
        <MetricCard label="Total in" loading={s.isLoading} value={money(s.data?.total_in)} />
        <MetricCard label="Total out" loading={s.isLoading} value={money(s.data?.total_out)} />
        <MetricCard label="Review queue" icon={Receipt} loading={queue.isLoading} value={queue.data?.length ?? '—'} hint={flagged ? `${flagged} flagged` : 'nothing flagged'} tone={flagged ? 'danger' : (queue.data?.length ?? 0) > 0 ? 'warning' : 'default'} />
      </div>
      {/* grid-cols-1 (minmax(0, 1fr)), not the implicit auto track: the chart's min-content would widen the page. */}
      <div className="mt-6 grid grid-cols-1 gap-5">
        <div className="min-w-0 space-y-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2"><Donut title="Income by category" data={pie('in')} /><Donut title="Spending by category" data={pie('out')} /></div>
          <section className="card">
            <SectionHeader title="Recent transactions" actions={<button type="button" onClick={() => onOpen('ledger')} className="t-label inline-flex min-h-11 items-center hover:text-accent-text">Full ledger →</button>} />
            {recent.isLoading ? <Skeleton rows={5} /> : recent.error ? <ErrorState error={recent.error} onRetry={() => recent.refetch()} /> : !recent.data?.length ? <EmptyState title="No ledger entries yet" className="!py-6" /> : <ul>{recent.data.map((r) => <TransactionRow key={r.id} row={r} />)}</ul>}
          </section>
        </div>
      </div>
    </>
  );
}
