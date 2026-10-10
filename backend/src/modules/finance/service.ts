import type { Knex } from 'knex';
import { getDb, lockRow } from '../../config/db';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { storeFile } from '../../lib/storage';
import { sendMail, siteLink } from '../../lib/email';
import { logger } from '../../lib/logger';
import { hmacSha256 } from '../../lib/hash';
import { env } from '../../config/env';
import { evaluateFlags } from './anomaly';

const escapeHtml = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const round2 = (n: number) => Math.round(n * 100) / 100;
/**
 * Period bounds as UTC Dates — the same instants MySQL used for the old 'YYYY-MM-DD' strings (UTC session/connection
 * time zone). On SQLite occurred_at is stored as epoch ms, which never compared against the old text bounds.
 */
const dayStart = (d: string) => new Date(`${d}T00:00:00.000Z`);
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999Z`);

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
  // Direction carries the sign; a negative/NaN amount would silently invert or corrupt the balance.
  if (!Number.isFinite(e.amount) || e.amount < 0) throw badRequest(`Invalid ledger amount: ${e.amount}`);
  const exists = await trx('ledger_entries').where({ source_type: e.source_type, source_id: e.source_id }).first();
  if (exists) return exists.id as number;
  const [id] = await trx('ledger_entries').insert({ ...e, occurred_at: e.occurred_at ?? new Date() });
  return id as number;
}

/** Corrections are reversing entries, never updates. */
export async function reverseEntry(admin_id: number, entry_id: number, memo: string) {
  return getDb().transaction(async (trx) => {
    const orig = await trx('ledger_entries').where({ id: entry_id }).first();
    if (!orig) throw notFound('Ledger entry not found');
    // recordEntry is idempotent on (source_type, source_id), so a second reversal used to answer 201 without writing anything.
    if (await trx('ledger_entries').where({ source_type: 'reversal', source_id: entry_id }).first()) throw conflict('Entry already reversed');
    return writeReversal(trx, orig, memo, admin_id);
  });
}

const writeReversal = (trx: Knex, orig: any, memo: string, entered_by: number | null) => recordEntry(trx, {
  direction: orig.direction === 'in' ? 'out' : 'in', amount: Number(orig.amount), category: orig.category,
  source_type: 'reversal', source_id: orig.id, event_id: orig.event_id, fundraiser_id: orig.fundraiser_id,
  memo: `Reversal of #${orig.id}: ${memo}`, entered_by,
});

/**
 * Reverse the income a payment brought in (cancelled paid order, cancelled paid ticket). Idempotent: an already
 * reversed entry is left alone. Returns the reversal's id, or null when the payment never reached the ledger.
 */
export async function reversePaymentIncome(trx: Knex, payment_id: number, memo: string, entered_by: number | null) {
  const orig = await trx('ledger_entries').where({ source_type: 'payment', source_id: payment_id }).first();
  if (!orig) return null;
  return writeReversal(trx, orig, memo, entered_by);
}

const sumBy = async (db: Knex, group: string[], where: (qb: Knex.QueryBuilder) => void) =>
  db('ledger_entries').modify(where).select(group).sum({ total: 'amount' }).groupBy(group);

export async function summary(q: { from?: string; to?: string }) {
  const db = getDb();
  const period = (qb: Knex.QueryBuilder) => {
    if (q.from) qb.where('occurred_at', '>=', dayStart(q.from));
    if (q.to) qb.where('occurred_at', '<=', dayEnd(q.to));
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
  // SQLite: occurred_at is epoch ms when written from a JS Date (strftime would read it as a Julian day → NULL month).
  const monthExpr = db.client.config.client === 'mysql2'
    ? db.raw("DATE_FORMAT(occurred_at, '%Y-%m')")
    : db.raw("CASE WHEN typeof(occurred_at) IN ('integer', 'real') THEN strftime('%Y-%m', occurred_at / 1000, 'unixepoch') ELSE strftime('%Y-%m', occurred_at) END");
  const byMonth = await db('ledger_entries').modify(period).select({ month: monthExpr }, 'direction').sum({ total: 'amount' }).groupBy('month', 'direction').orderBy('month');
  return {
    balance: round2(tin - tout), total_in: round2(tin), total_out: round2(tout), // e.g. 1850.1 − 450.2 = 1399.8999999999999
    by_category: byCategory.map((r: any) => ({ ...r, total: n(r.total) })),
    by_event: byEvent.map((r: any) => ({ ...r, total: n(r.total) })),
    by_fundraiser: byFundraiser.map((r: any) => ({ ...r, total: n(r.total) })),
    by_month: byMonth.map((r: any) => ({ ...r, total: n(r.total) })),
  };
}

/** `limit: null` = no limit (CSV export). */
export async function ledger(q: { from?: string; to?: string; category?: string; limit?: number | null; offset?: number }) {
  const db = getDb();
  return db('ledger_entries as l')
    .leftJoin('users as u', 'u.id', 'l.entered_by')
    .leftJoin('events as e', 'e.id', 'l.event_id')
    .leftJoin('fundraisers as f', 'f.id', 'l.fundraiser_id')
    .modify((qb) => {
      if (q.from) qb.where('l.occurred_at', '>=', dayStart(q.from));
      if (q.to) qb.where('l.occurred_at', '<=', dayEnd(q.to));
      if (q.category) qb.where('l.category', q.category);
      if (q.limit !== null) qb.limit(q.limit ?? 500);
      if (q.offset) qb.offset(q.offset);
    })
    .select('l.*', 'u.name as entered_by_name', 'e.title as event_title', 'f.name as fundraiser_name')
    .orderBy('l.occurred_at', 'desc').orderBy('l.id', 'desc');
}

export function toCsv(rows: any[]) {
  const cols = ['id', 'occurred_at', 'direction', 'amount', 'category', 'source_type', 'source_id', 'event_title', 'fundraiser_name', 'memo', 'entered_by_name'];
  // Memos carry volunteer-written text: neutralise spreadsheet formulas (=,+,-,@,tab,CR) so opening the CSV can't run them.
  const cell = (v: any, c: string) => {
    if (v instanceof Date || (c === 'occurred_at' && typeof v === 'number')) return new Date(v).toISOString();
    const s = String(v ?? '');
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  };
  const esc = (v: any, c: string) => `"${cell(v, c).replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c], c)).join(','))].join('\n');
}

// ---------- expenses / reimbursements ----------

export async function submitExpense(user_id: number, input: { amount: number; category: string; description?: string; event_id?: number; fundraiser_id?: number }, file?: { buffer: Buffer; mimetype: string }) {
  const db = getDb();
  // Unknown ids used to fail on the foreign key → 500 (after the receipt was already uploaded).
  if (input.event_id && !(await db('events').where({ id: input.event_id }).first())) throw badRequest('Event not found');
  if (input.fundraiser_id && !(await db('fundraisers').where({ id: input.fundraiser_id }).first())) throw badRequest('Fundraiser not found');
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

/** HMAC capability for one receipt, so a plain <a href> (no Authorization header) can open it for a few hours. */
export const receiptSig = (id: number, exp: number) => hmacSha256(env.JWT_SECRET, `receipt:${id}:${exp}`);
const signedReceiptPath = (id: number) => { const exp = Math.floor(Date.now() / 1000) + 6 * 3600; return `/api/expenses/${id}/receipt?exp=${exp}&sig=${receiptSig(id, exp)}`; };

export async function listExpenses(user: { id: number; role: string }, q: { status?: string; flagged?: boolean; mine?: boolean }) {
  const db = getDb();
  const admin = user.role === 'admin';
  // Without CLOUDINARY_URL receipt_url is a data: URL of up to ~7 MB per row; never pull it into the list. Such rows get a
  // short-lived signed same-origin link instead (a top-level link to a data: URL is blocked by browsers anyway).
  const rows = await db('expenses as x').leftJoin('users as u', 'u.id', 'x.submitted_by')
    .select('x.id', 'x.created_at', 'x.updated_at', 'x.submitted_by', 'x.event_id', 'x.fundraiser_id', 'x.amount', 'x.category', 'x.description',
      'x.receipt_hash', 'x.status', 'x.reviewed_by', 'x.reviewed_at', 'x.review_note', 'x.flags', 'u.name as submitted_by_name',
      db.raw("CASE WHEN x.receipt_url LIKE 'data:%' THEN 'data:' ELSE x.receipt_url END as receipt_url"))
    .modify((qb) => {
      if (!admin || q.mine) qb.where('x.submitted_by', user.id);
      if (q.status) qb.where('x.status', q.status);
    }).orderBy('x.id', 'desc');
  return rows.map((r: any) => ({ ...r, receipt_url: r.receipt_url === 'data:' ? signedReceiptPath(r.id) : r.receipt_url, flags: typeof r.flags === 'string' ? JSON.parse(r.flags) : r.flags ?? [] }))
    .filter((r: any) => !q.flagged || (r.flags?.length ?? 0) > 0);
}

export async function reviewExpense(reviewer_id: number, id: number, decision: 'approved' | 'rejected', note?: string) {
  const db = getDb();
  // Also reached from AI proposals (payload chosen by the LLM): only approve/reject — never e.g. 'paid', which would
  // mark an expense paid with no ledger entry.
  if (decision !== 'approved' && decision !== 'rejected') throw badRequest('Decision must be approved or rejected');
  if (note != null && (typeof note !== 'string' || note.length > 1000)) throw badRequest('Invalid note');
  const x = await getExpense(id);
  if (!x) throw notFound('Expense not found');
  if (x.status !== 'submitted') throw badRequest(`Expense is already ${x.status}`);
  // Four-eyes rule: another admin reviews. Kept from the treasurer era; it is the main control on reimbursements.
  if (Number(x.submitted_by) === reviewer_id) throw forbidden('Cannot review your own expense');
  // Conditional update: two admins reviewing at once can't both win (last write used to overwrite the first).
  const n = await db('expenses').where({ id, status: 'submitted' }).update({ status: decision, reviewed_by: reviewer_id, reviewed_at: new Date(), review_note: note ?? null });
  if (!n) throw conflict('Expense was reviewed by someone else');
  await sendMail({ to: x.submitted_by_email, subject: `Reimbursement ${decision}: ₹${x.amount}`, html: `<p>Your expense "${escapeHtml(x.description ?? x.category)}" was <b>${decision}</b>.</p>${note ? `<p>Note: ${escapeHtml(note)}</p>` : ''}${siteLink('/admin?tab=finance&view=submit', 'See your expenses')}` })
    .catch((err) => logger.error({ err, expense_id: id }, 'review email failed')); // review is committed; don't 500 on a mail outage
  return getExpense(id);
}

/** Money handed over → status 'paid' + ledger `out` entry. */
export async function payExpense(admin_id: number, id: number) {
  const db = getDb();
  return db.transaction(async (trx) => {
    const x = await lockRow(trx('expenses').where({ id })).first();
    if (!x) throw notFound('Expense not found');
    if (x.status !== 'approved') throw badRequest('Only approved expenses can be paid');
    await trx('expenses').where({ id }).update({ status: 'paid' });
    await recordEntry(trx, { direction: 'out', amount: Number(x.amount), category: 'reimbursement', source_type: 'expense', source_id: id, event_id: x.event_id, fundraiser_id: x.fundraiser_id, memo: x.description ?? x.category, entered_by: admin_id });
    return trx('expenses').where({ id }).first();
  });
}

/** Admin records cash income for a fundraiser (bake sale) → ledger. */
export async function recordFundraiserCash(admin_id: number, fundraiser_id: number, amount: number, memo?: string) {
  const db = getDb();
  const f = await db('fundraisers').where({ id: fundraiser_id }).first();
  if (!f) throw notFound('Fundraiser not found');
  return db.transaction(async (trx) => {
    const [cash_id] = await trx('cash_receipts').insert({ fundraiser_id, amount, memo: memo ?? null, entered_by: admin_id });
    const id = await recordEntry(trx, { direction: 'in', amount, category: 'fundraiser', source_type: 'cash_receipt', source_id: cash_id as number, fundraiser_id, memo: memo ?? `Cash income: ${f.name}`, entered_by: admin_id });
    return trx('ledger_entries').where({ id }).first();
  });
}
