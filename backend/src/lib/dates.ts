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

/** The UTC instant at which calendar day `ymd` starts in `timeZone` (e.g. IST midnight = 18:30 UTC the day before). */
export function startOfDayInTz(ymd: string, timeZone = env.APP_TIMEZONE): Date {
  const guess = new Date(`${ymd}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return new Date(guess.getTime() - (wall - guess.getTime()));
}
