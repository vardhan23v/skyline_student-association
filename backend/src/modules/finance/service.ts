import type { Knex } from 'knex';
import { getDb, lockRow } from '../../config/db';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { storeFile } from '../../lib/storage';
import { sendMail } from '../../lib/email';
import { evaluateFlags } from './anomaly';

export type Category = 'dues' | 'ticket' | 'merch' | 'fundraiser' | 'reimbursement' | 'other';
export type Entry = {
  direction: 'in' | 'out'; amount: number; category: Category; source_type: string; source_id: number;
  event_id?: number | null; fundraiser_id?: number | null; memo?: string; entered_by?: number | null; occurred_at?: Date;
};

/**
 * The only way money enters the ledger. Append-only; UNIQUE(source_type, source_id) makes it idempotent.
 * Other modules call this — never INSERT INTO ledger_entries directly.
 */
export async function recordEntry(trx: Knex, e: Entry) {
  const exists = await trx('ledger_entries').where({ source_type: e.source_type, source_id: e.source_id }).first();
  if (exists) return exists.id as number;
  const [id] = await trx('ledger_entries').insert({ ...e, occurred_at: e.occurred_at ?? new Date() });
  return id as number;
}

/** Corrections are reversing entries, never updates. */
export async function reverseEntry(treasurer_id: number, entry_id: number, memo: string) {
  const db = getDb();
  const orig = await db('ledger_entries').where({ id: entry_id }).first();
  if (!orig) throw notFound('Ledger entry not found');
  return recordEntry(db, {
    direction: orig.direction === 'in' ? 'out' : 'in', amount: Number(orig.amount), category: orig.category,
    source_type: 'reversal', source_id: entry_id, event_id: orig.event_id, fundraiser_id: orig.fundraiser_id,
    memo: `Reversal of #${entry_id}: ${memo}`, entered_by: treasurer_id,
  });
}

const sumBy = async (db: Knex, group: string[], where: (qb: Knex.QueryBuilder) => void) =>
  db('ledger_entries').modify(where).select(group).sum({ total: 'amount' }).groupBy(group);

export async function summary(q: { from?: string; to?: string }) {
  const db = getDb();
  const period = (qb: Knex.QueryBuilder) => {
    if (q.from) qb.where('occurred_at', '>=', q.from);
    if (q.to) qb.where('occurred_at', '<=', q.to + ' 23:59:59');
  };
  const [totals, byCategory, byEvent, byFundraiser] = await Promise.all([
    sumBy(db, ['direction'], period),
    sumBy(db, ['category', 'direction'], period),
    db('ledger_entries as l').join('events as e', 'e.id', 'l.event_id').modify((qb) => period(qb as any))
      .select('l.event_id', 'e.title', 'l.direction').sum({ total: 'l.amount' }).groupBy('l.event_id', 'e.title', 'l.direction'),
    db('ledger_entries as l').join('fundraisers as f', 'f.id', 'l.fundraiser_id').modify((qb) => period(qb as any))
      .select('l.fundraiser_id', 'f.name', 'f.target_amount', 'l.direction').sum({ total: 'l.amount' }).groupBy('l.fundraiser_id', 'f.name', 'f.target_amount', 'l.direction'),
  ]);
  const n = (v: any) => Number(v ?? 0);
  const tin = n(totals.find((t: any) => t.direction === 'in')?.total);
  const tout = n(totals.find((t: any) => t.direction === 'out')?.total);
  const monthExpr = db.client.config.client === 'mysql2' ? db.raw("DATE_FORMAT(occurred_at, '%Y-%m')") : db.raw("strftime('%Y-%m', occurred_at)");
  const byMonth = await db('ledger_entries').modify(period).select({ month: monthExpr }, 'direction').sum({ total: 'amount' }).groupBy('month', 'direction').orderBy('month');
  return {
    balance: tin - tout, total_in: tin, total_out: tout,
    by_category: byCategory.map((r: any) => ({ ...r, total: n(r.total) })),
    by_event: byEvent.map((r: any) => ({ ...r, total: n(r.total) })),
    by_fundraiser: byFundraiser.map((r: any) => ({ ...r, total: n(r.total) })),
    by_month: byMonth.map((r: any) => ({ ...r, total: n(r.total) })),
  };
}

export async function ledger(q: { from?: string; to?: string; category?: string; limit?: number; offset?: number }) {
  const db = getDb();
  return db('ledger_entries as l')
    .leftJoin('users as u', 'u.id', 'l.entered_by')
    .leftJoin('events as e', 'e.id', 'l.event_id')
    .leftJoin('fundraisers as f', 'f.id', 'l.fundraiser_id')
    .modify((qb) => {
      if (q.from) qb.where('l.occurred_at', '>=', q.from);
      if (q.to) qb.where('l.occurred_at', '<=', q.to + ' 23:59:59');
      if (q.category) qb.where('l.category', q.category);
    })
    .select('l.*', 'u.name as entered_by_name', 'e.title as event_title', 'f.name as fundraiser_name')
    .orderBy('l.occurred_at', 'desc').orderBy('l.id', 'desc')
    .limit(q.limit ?? 500).offset(q.offset ?? 0);
}

export function toCsv(rows: any[]) {
  const cols = ['id', 'occurred_at', 'direction', 'amount', 'category', 'source_type', 'source_id', 'event_title', 'fundraiser_name', 'memo', 'entered_by_name'];
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

// ---------- expenses / reimbursements ----------

export async function submitExpense(user_id: number, input: { amount: number; category: string; description?: string; event_id?: number; fundraiser_id?: number }, file?: { buffer: Buffer; mimetype: string }) {
  const db = getDb();
  let receipt_url: string | null = null, receipt_hash: string | null = null;
  if (file) ({ url: receipt_url, hash: receipt_hash } = await storeFile(file.buffer, file.mimetype, 'receipts'));
  const flags = await evaluateFlags(db, { ...input, submitted_by: user_id, receipt_hash, id: null });
  const [id] = await db('expenses').insert({
    submitted_by: user_id, amount: input.amount, category: input.category, description: input.description ?? null,
    event_id: input.event_id ?? null, fundraiser_id: input.fundraiser_id ?? null, receipt_url, receipt_hash, flags: JSON.stringify(flags), status: 'submitted',
  });
  return getExpense(id as number);
}

export const getExpense = async (id: number) => {
  const r = await getDb()('expenses as x').leftJoin('users as u', 'u.id', 'x.submitted_by').select('x.*', 'u.name as submitted_by_name', 'u.email as submitted_by_email').where('x.id', id).first();
  if (r && typeof r.flags === 'string') r.flags = JSON.parse(r.flags);
  return r;
};

export async function listExpenses(user: { id: number; role: string }, q: { status?: string; flagged?: boolean; mine?: boolean }) {
  const db = getDb();
  const treasurer = user.role === 'treasurer';
  const rows = await db('expenses as x').leftJoin('users as u', 'u.id', 'x.submitted_by')
    .select('x.*', 'u.name as submitted_by_name')
    .modify((qb) => {
      if (!treasurer || q.mine) qb.where('x.submitted_by', user.id);
      if (q.status) qb.where('x.status', q.status);
    }).orderBy('x.id', 'desc');
  return rows.map((r: any) => ({ ...r, flags: typeof r.flags === 'string' ? JSON.parse(r.flags) : r.flags ?? [] }))
    .filter((r: any) => !q.flagged || (r.flags?.length ?? 0) > 0);
}

export async function reviewExpense(treasurer_id: number, id: number, decision: 'approved' | 'rejected', note?: string) {
  const db = getDb();
  const x = await getExpense(id);
  if (!x) throw notFound('Expense not found');
  if (x.status !== 'submitted') throw badRequest(`Expense is already ${x.status}`);
  if (x.submitted_by === treasurer_id) throw forbidden('Cannot review your own expense');
  await db('expenses').where({ id }).update({ status: decision, reviewed_by: treasurer_id, reviewed_at: new Date(), review_note: note ?? null });
  await sendMail({ to: x.submitted_by_email, subject: `Reimbursement ${decision}: ₹${x.amount}`, html: `<p>Your expense "${x.description ?? x.category}" was <b>${decision}</b>.</p>${note ? `<p>Note: ${note}</p>` : ''}` });
  return getExpense(id);
}

/** Money handed over → status 'paid' + ledger `out` entry. */
export async function payExpense(treasurer_id: number, id: number) {
  const db = getDb();
  return db.transaction(async (trx) => {
    const x = await lockRow(trx('expenses').where({ id })).first();
    if (!x) throw notFound('Expense not found');
    if (x.status !== 'approved') throw badRequest('Only approved expenses can be paid');
    await trx('expenses').where({ id }).update({ status: 'paid' });
    await recordEntry(trx, { direction: 'out', amount: Number(x.amount), category: 'reimbursement', source_type: 'expense', source_id: id, event_id: x.event_id, fundraiser_id: x.fundraiser_id, memo: x.description ?? x.category, entered_by: treasurer_id });
    return trx('expenses').where({ id }).first();
  });
}

/** Treasurer records cash income for a fundraiser (bake sale) → ledger. */
export async function recordFundraiserCash(treasurer_id: number, fundraiser_id: number, amount: number, memo?: string) {
  const db = getDb();
  const f = await db('fundraisers').where({ id: fundraiser_id }).first();
  if (!f) throw notFound('Fundraiser not found');
  return db.transaction(async (trx) => {
    const [cash_id] = await trx('cash_receipts').insert({ fundraiser_id, amount, memo: memo ?? null, entered_by: treasurer_id });
    const id = await recordEntry(trx, { direction: 'in', amount, category: 'fundraiser', source_type: 'cash_receipt', source_id: cash_id as number, fundraiser_id, memo: memo ?? `Cash income: ${f.name}`, entered_by: treasurer_id });
    return trx('ledger_entries').where({ id }).first();
  });
}
