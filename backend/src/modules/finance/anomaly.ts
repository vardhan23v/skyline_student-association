import type { Knex } from 'knex';

export type Flag = { code: 'HIGH_AMOUNT' | 'DUPLICATE_RECEIPT' | 'POSSIBLE_RESUBMIT' | 'OVER_BUDGET' | 'NO_RECEIPT'; rule: string };
export const ABSOLUTE_CAP = 20_000;
export const NO_RECEIPT_THRESHOLD = 200;

type Candidate = { id: number | null; submitted_by: number; amount: number; category: string; receipt_hash: string | null; event_id?: number | null; fundraiser_id?: number | null; created_at?: Date | string | number | null };
/** DB `created_at` → Date (MySQL gives a Date; SQLite gives UTC 'YYYY-MM-DD HH:MM:SS' text). */
const toDate = (v: Date | string | number) => v instanceof Date ? v : typeof v === 'number' ? new Date(v) : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v.replace(' ', 'T')}Z`);

/** `created_at` comes from the DB default: DATETIME on MySQL, 'YYYY-MM-DD HH:MM:SS' (UTC) text on SQLite — a JS Date binds as epoch ms there. */
const createdAtBound = (db: Knex, d: Date) => (db.client.config.client === 'mysql2' ? d : d.toISOString().replace('T', ' ').slice(0, 19));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Rule-based flags (§9). They prompt review; they never auto-reject. Pure given a db handle — unit-testable. */
export async function evaluateFlags(db: Knex, x: Candidate): Promise<Flag[]> {
  const flags: Flag[] = [];
  const notSelf = (qb: Knex.QueryBuilder) => { if (x.id) qb.whereNot('id', x.id); };

  const approved = await db('expenses').where({ category: x.category }).whereIn('status', ['approved', 'paid']).modify(notSelf).pluck('amount');
  const amounts = approved.map(Number);
  if (amounts.length >= 5 && x.amount > 2.5 * median(amounts)) flags.push({ code: 'HIGH_AMOUNT', rule: `Amount > 2.5× median (${median(amounts)}) of approved ${x.category} expenses` });
  else if (x.amount > ABSOLUTE_CAP) flags.push({ code: 'HIGH_AMOUNT', rule: `Amount exceeds absolute cap ₹${ABSOLUTE_CAP}` });

  if (x.receipt_hash) {
    const dup = await db('expenses').where({ receipt_hash: x.receipt_hash }).modify(notSelf).first();
    if (dup) flags.push({ code: 'DUPLICATE_RECEIPT', rule: `Same receipt file as expense #${dup.id}` });
  } else if (x.amount > NO_RECEIPT_THRESHOLD) {
    flags.push({ code: 'NO_RECEIPT', rule: `Amount > ₹${NO_RECEIPT_THRESHOLD} without a receipt` });
  }

  // ±7 days around the candidate's own submission time — not "the last 7 days from now", which made the nightly
  // rescan silently drop the flag from anything still in the queue after a week.
  let at = x.created_at ? toDate(x.created_at) : new Date();
  if (Number.isNaN(at.getTime())) at = new Date();
  const lo = new Date(at.getTime() - 7 * 864e5), hi = new Date(at.getTime() + 7 * 864e5);
  const resubmit = await db('expenses').where({ submitted_by: x.submitted_by }).where('created_at', '>=', createdAtBound(db, lo)).where('created_at', '<=', createdAtBound(db, hi))
    .whereBetween('amount', [x.amount * 0.99, x.amount * 1.01]).modify(notSelf).first();
  if (resubmit) flags.push({ code: 'POSSIBLE_RESUBMIT', rule: `Same submitter, same amount ±1% within 7 days (expense #${resubmit.id})` });

  if (x.fundraiser_id) {
    const f = await db('fundraisers').where({ id: x.fundraiser_id }).first();
    if (f?.budget != null) {
      const [{ total }] = await db('expenses').where({ fundraiser_id: x.fundraiser_id }).whereIn('status', ['approved', 'paid']).modify(notSelf).sum({ total: 'amount' });
      if (Number(total ?? 0) + x.amount > Number(f.budget)) flags.push({ code: 'OVER_BUDGET', rule: `Approved + this exceeds fundraiser budget ₹${f.budget}` });
    }
  }
  return flags;
}

/** Nightly re-scan over submitted expenses. */
export async function rescanSubmitted(db: Knex) {
  const rows = await db('expenses').where({ status: 'submitted' });
  for (const r of rows) {
    const flags = await evaluateFlags(db, { ...r, amount: Number(r.amount) });
    await db('expenses').where({ id: r.id }).update({ flags: JSON.stringify(flags) });
  }
  return rows.length;
}
