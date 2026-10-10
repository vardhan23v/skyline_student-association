/** Shared formatters (INR, en-IN). Kept tiny and dependency-free. */
export const money = (n: number | string | null | undefined) => `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
/**
 * DATE columns arrive as bare `YYYY-MM-DD`; `new Date()` reads that as UTC midnight (a day early west of UTC), so parse
 * it as a local calendar date. SQLite's DB-default timestamps arrive as UTC `YYYY-MM-DD HH:MM:SS`, which browsers read
 * as local time (Safari: Invalid Date), so mark them UTC. Anything else (ISO strings, epoch ms) goes straight to Date.
 */
const parse = (s: string) => {
  if (typeof s !== 'string') return new Date(s);
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (d) return new Date(+d[1], +d[2] - 1, +d[3]);
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : s);
};
export const date = (s?: string | null) => (s ? parse(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const datetime = (s?: string | null) => (s ? parse(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const compact = (n: number) => (n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
