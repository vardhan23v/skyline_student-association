import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { get } from '@/api/client';
import type { Expense, Summary } from '@/api/types';
import { PageTitle, Stat, money } from '@/components/ui';

const colors = ['#4f46e5', '#059669', '#d97706', '#e11d48', '#0891b2', '#7c3aed'];

export function TreasurerHome() {
  const s = useQuery({ queryKey: ['finance', 'summary', ''], queryFn: () => get<Summary>('/finance/summary') });
  const queue = useQuery({ queryKey: ['expenses', 'submitted'], queryFn: () => get<Expense[]>('/expenses?status=submitted') });
  const pie = (d: string) => (s.data?.by_category ?? []).filter((r) => r.direction === d).map((r) => ({ name: r.category, value: r.total }));
  const flagged = queue.data?.filter((x) => x.flags.length).length ?? 0;
  return (
    <>
      <PageTitle title="Treasurer" sub="Finance overview. Writes here require the treasurer role — admins cannot touch the ledger." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Stat label="Balance" value={money(s.data?.balance)} /><Stat label="Total in" value={money(s.data?.total_in)} /><Stat label="Total out" value={money(s.data?.total_out)} />
        <Stat label="Review queue" value={queue.data?.length ?? '…'} hint={flagged ? `${flagged} flagged` : 'nothing flagged'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <div className="card"><h3 className="font-semibold mb-1">Income by category</h3><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={pie('in')} dataKey="value" nameKey="name" outerRadius={80}>{pie('in').map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div>
        <div className="card"><h3 className="font-semibold mb-1">Spending by category</h3><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={pie('out')} dataKey="value" nameKey="name" outerRadius={80}>{pie('out').map((_, i) => <Cell key={i} fill={colors[(i + 3) % colors.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div>
        <div className="space-y-3">{[['/treasurer/expenses', '🧾 Expense review queue'], ['/treasurer/ledger', '📒 Ledger & CSV export'], ['/treasurer/cash', '💵 Record cash'], ['/finance', '📊 Full summary']].map(([to, t]) => <Link key={to} to={to} className="card block hover:shadow-md font-medium">{t}</Link>)}</div>
      </div>
    </>
  );
}
