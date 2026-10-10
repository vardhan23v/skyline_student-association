import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { get } from '@/api/client';
import type { Summary } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Field, PageTitle, Stat, money } from '@/components/ui';
import { Link } from 'react-router-dom';

/** Read-only transparency view (§5 finance/summary, role member). */
export function FinancePublicPage() {
  const { me } = useAuth();
  const [period, setPeriod] = useState({ from: '', to: '' });
  const qs = new URLSearchParams(Object.entries(period).filter(([, v]) => v)).toString();
  const q = useQuery({ queryKey: ['finance', 'summary', qs], queryFn: () => get<Summary>(`/finance/summary${qs ? `?${qs}` : ''}`), enabled: !!me });
  if (!me) return <div className="card">Club finances are visible to logged-in members. <Link to="/login" className="text-indigo-600">Log in</Link>.</div>;
  const s = q.data;
  const cat = (d: string) => (s?.by_category ?? []).filter((r) => r.direction === d);
  const months = Object.values((s?.by_month ?? []).reduce((acc: any, r) => { acc[r.month] ??= { month: r.month, in: 0, out: 0 }; acc[r.month][r.direction] = r.total; return acc; }, {}));
  return (
    <>
      <PageTitle title="Club finances" sub="Every rupee in and out, derived from the append-only ledger." action={<div className="flex gap-2"><Field label="From"><input type="date" className="input" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} /></Field><Field label="To"><input type="date" className="input" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} /></Field></div>} />
      {s && (<>
        <div className="grid gap-4 sm:grid-cols-3 mb-6"><Stat label="Balance" value={money(s.balance)} /><Stat label="Total in" value={money(s.total_in)} /><Stat label="Total out" value={money(s.total_out)} /></div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card"><h3 className="font-semibold mb-2">By month</h3><ResponsiveContainer width="100%" height={240}><BarChart data={months}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Legend /><Bar dataKey="in" fill="#059669" name="In" /><Bar dataKey="out" fill="#e11d48" name="Out" /></BarChart></ResponsiveContainer></div>
          <div className="card"><h3 className="font-semibold mb-2">By category</h3>
            <table className="table"><thead><tr><th>Category</th><th>In</th><th>Out</th></tr></thead><tbody>
              {Array.from(new Set(s.by_category.map((r) => r.category))).map((c) => <tr key={c}><td className="capitalize">{c}</td><td>{money(cat('in').find((r) => r.category === c)?.total)}</td><td>{money(cat('out').find((r) => r.category === c)?.total)}</td></tr>)}
            </tbody></table></div>
          <div className="card"><h3 className="font-semibold mb-2">By event</h3><table className="table"><thead><tr><th>Event</th><th>Revenue</th><th>Spent</th></tr></thead><tbody>
            {Array.from(new Set(s.by_event.map((r) => r.event_id))).map((id) => { const rows = s.by_event.filter((r) => r.event_id === id); return <tr key={id}><td>{rows[0].title}</td><td>{money(rows.find((r) => r.direction === 'in')?.total)}</td><td>{money(rows.find((r) => r.direction === 'out')?.total)}</td></tr>; })}
          </tbody></table></div>
          <div className="card"><h3 className="font-semibold mb-2">By fundraiser</h3><table className="table"><thead><tr><th>Fundraiser</th><th>Raised</th><th>Target</th><th>Spent</th></tr></thead><tbody>
            {Array.from(new Set(s.by_fundraiser.map((r) => r.fundraiser_id))).map((id) => { const rows = s.by_fundraiser.filter((r) => r.fundraiser_id === id); return <tr key={id}><td>{rows[0].name}</td><td>{money(rows.find((r) => r.direction === 'in')?.total)}</td><td>{money(rows[0].target_amount)}</td><td>{money(rows.find((r) => r.direction === 'out')?.total)}</td></tr>; })}
          </tbody></table></div>
        </div>
      </>)}
    </>
  );
}
