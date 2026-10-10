import type { ReactNode } from 'react';

export const money = (n: number | string | null | undefined) => `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const date = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const datetime = (s?: string | null) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div><h1 className="text-2xl font-semibold">{title}</h1>{sub && <p className="text-sm text-slate-500 mt-1">{sub}</p>}</div>
      {action}
    </div>
  );
}

const tones: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800', confirmed: 'bg-emerald-100 text-emerald-800', paid: 'bg-emerald-100 text-emerald-800', published: 'bg-emerald-100 text-emerald-800', done: 'bg-emerald-100 text-emerald-800', approved: 'bg-sky-100 text-sky-800', fulfilled: 'bg-sky-100 text-sky-800', checked_in: 'bg-indigo-100 text-indigo-800', doing: 'bg-indigo-100 text-indigo-800',
  pending: 'bg-amber-100 text-amber-800', submitted: 'bg-amber-100 text-amber-800', todo: 'bg-slate-100 text-slate-700', draft: 'bg-slate-100 text-slate-700', planning: 'bg-slate-100 text-slate-700',
  expired: 'bg-rose-100 text-rose-800', rejected: 'bg-rose-100 text-rose-800', cancelled: 'bg-rose-100 text-rose-800', closed: 'bg-slate-200 text-slate-700', failed: 'bg-rose-100 text-rose-800',
};
export const Badge = ({ s }: { s?: string | null }) => <span className={`badge ${tones[s ?? ''] ?? 'bg-slate-100 text-slate-700'}`}>{(s ?? 'none').replace('_', ' ')}</span>;

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div className="card"><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className="text-2xl font-semibold mt-1">{value}</div>{hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as any;
  return <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm p-3">{e.message ?? String(e)}{e.details?.fieldErrors && <pre className="text-xs mt-1">{JSON.stringify(e.details.fieldErrors)}</pre>}</div>;
}

export function Empty({ children }: { children: ReactNode }) { return <div className="card text-center text-slate-500 text-sm py-8">{children}</div>; }

export function Field({ label, children }: { label: string; children: ReactNode }) { return <div><label className="label">{label}</label>{children}</div>; }
