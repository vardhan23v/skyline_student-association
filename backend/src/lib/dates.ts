import { env } from '../config/env';

/**
 * Calendar dates in the club's time zone (APP_TIMEZONE). `toISOString().slice(0, 10)` is the UTC date, which in
 * IST is still "yesterday" until 05:30 — memberships would stay current and expire a day late.
 */
export function ymdInTz(d: Date = new Date(), timeZone = env.APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export const todayYmd = () => ymdInTz(new Date());

/** Pure calendar arithmetic on a YYYY-MM-DD string. */
export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A DATE column value as YYYY-MM-DD (string from SQLite / mysql2 `dateStrings`, or a Date from older drivers). */
export const ymdOf = (v: string | Date) => (v instanceof Date ? ymdInTz(v) : String(v).slice(0, 10));
