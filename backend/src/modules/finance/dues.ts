import { getDb } from '../../config/db';
import { env } from '../../config/env';
import { addDaysYmd, todayYmd, ymdOf } from '../../lib/dates';
import { sendMail, siteLink } from '../../lib/email';
import { logger } from '../../lib/logger';
import { DEFAULT_DUES } from '../memberships/schemas';
import { receiptPath } from './service';

const round2 = (n: number) => Math.round(n * 100) / 100;
const group = <T extends { amount: number }>(rows: T[]) => ({ count: rows.length, total_amount: round2(rows.reduce((s, r) => s + r.amount, 0)), rows });
/** created_at is DATETIME on MySQL but UTC 'YYYY-MM-DD HH:MM:SS' text on SQLite. */
const toMs = (v: unknown) => (v instanceof Date ? v.getTime() : Date.parse(`${String(v).replace(' ', 'T')}${/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? '' : 'Z'}`));
const REMIND_EVERY_MS = 24 * 3600_000;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * GET /admin/dues — who owes the club and whom the club owes, computed live from existing tables.
 * - memberships_due: each member's latest membership, when it is pending (started, never paid), expired, or active but
 *   ending within 14 days. Amount = the dues price.
 * - unpaid_orders / unpaid_tickets: still holding stock or a seat, with a pending payment.
 * - reimbursements_owed: expenses approved but not yet paid out.
 */
export async function duesOverview() {
  const db = getDb();
  const today = todayYmd(), soon = addDaysYmd(today, 14);
  const [members, orders, tickets, expenses] = await Promise.all([
    db('members as m').join('users as u', 'u.id', 'm.user_id')
      .join('memberships as ms', function () { this.on('ms.member_id', 'm.id').andOn('ms.id', '=', db.raw('(SELECT MAX(id) FROM memberships WHERE member_id = m.id)')); })
      .where((w) => w.where('ms.status', 'pending').orWhere('ms.status', 'expired').orWhere((a) => a.where('ms.status', 'active').where('ms.expiry_date', '<=', soon)))
      .select('ms.id', 'm.id as member_id', 'm.student_id', 'u.name', 'u.email', 'ms.status', 'ms.expiry_date', 'ms.last_reminded_at').orderBy('ms.expiry_date'),
    db('orders as o').join('users as u', 'u.id', 'o.user_id').join('payments as p', 'p.id', 'o.payment_id')
      .where('o.status', 'pending').where('p.status', 'pending')
      .select('o.id', 'u.name', 'u.email', 'o.total', 'o.created_at', 'o.last_reminded_at').orderBy('o.created_at'),
    db('tickets as t').join('events as e', 'e.id', 't.event_id').join('payments as p', 'p.id', 't.payment_id')
      .where('t.status', 'pending').where('p.status', 'pending')
      .select('t.id', 'e.title as event_title', 't.holder_name as name', 't.holder_email as email', 't.price', 't.created_at').orderBy('t.created_at'),
    db('expenses as x').leftJoin('users as u', 'u.id', 'x.submitted_by').where('x.status', 'approved')
      .select('x.id', 'u.name as submitter', 'x.amount', 'x.category', 'x.description', 'x.reviewed_at as approved_at', db.raw("CASE WHEN x.receipt_url LIKE 'data:%' THEN 'data:' ELSE x.receipt_url END as receipt_url")) // never pull a multi-MB inline receipt
      .orderBy('x.reviewed_at'),
  ]);
  const now = Date.now();
  // A membership "expired" by date but not yet swept by the nightly job still reads as active here; call it what it is.
  const memberships_due = group(members.map((r: any) => {
    const expiry = r.expiry_date ? ymdOf(r.expiry_date) : null;
    const status = r.status === 'active' && expiry && expiry < today ? 'expired' : r.status === 'active' ? 'expiring' : r.status;
    return { id: Number(r.id), member_id: Number(r.member_id), student_id: r.student_id, name: r.name, email: r.email, status, expiry_date: expiry, amount: DEFAULT_DUES, reminded_at: r.last_reminded_at ?? null };
  }));
  const unpaid_orders = group(orders.map((r: any) => ({
    id: Number(r.id), name: r.name, email: r.email, amount: Number(r.total), created_at: r.created_at, reminded_at: r.last_reminded_at ?? null,
    minutes_left: Math.max(0, Math.ceil((toMs(r.created_at) + env.PENDING_HOLD_MINUTES * 60_000 - now) / 60_000)),
  })));
  const unpaid_tickets = group(tickets.map((r: any) => ({ id: Number(r.id), event_title: r.event_title, name: r.name, email: r.email, amount: Number(r.price), created_at: r.created_at })));
  const reimbursements_owed = group(expenses.map((r: any) => ({
    id: Number(r.id), submitter: r.submitter, amount: Number(r.amount), category: r.category, description: r.description, approved_at: r.approved_at,
    receipt_url: r.receipt_url ? receiptPath(Number(r.id), r.receipt_url) : null,
  })));
  return {
    memberships_due, unpaid_orders, unpaid_tickets, reimbursements_owed,
    totals: { owed_to_club: round2(memberships_due.total_amount + unpaid_orders.total_amount + unpaid_tickets.total_amount), owed_by_club: reimbursements_owed.total_amount },
    as_of: today,
  };
}

/**
 * POST /admin/dues/remind — email each selected person once per 24 hours (stamped on the membership or order, claimed
 * with a conditional update so two clicks can't both send). Returns how many were sent and skipped.
 */
export async function sendDuesReminders(group: 'memberships_due' | 'unpaid_orders', ids: number[]) {
  const db = getDb();
  const cutoff = new Date(Date.now() - REMIND_EVERY_MS);
  const table = group === 'memberships_due' ? 'memberships' : 'orders';
  let sent = 0, skipped = 0;
  for (const id of [...new Set(ids)]) {
    const row = group === 'memberships_due'
      ? await db('memberships as ms').join('members as m', 'm.id', 'ms.member_id').join('users as u', 'u.id', 'm.user_id').where('ms.id', id).select('ms.status', 'ms.expiry_date', 'u.name', 'u.email').first()
      : await db('orders as o').join('users as u', 'u.id', 'o.user_id').where('o.id', id).where('o.status', 'pending').select('o.total', 'u.name', 'u.email').first();
    if (!row) { skipped++; continue; }
    const claimed = await db(table).where({ id }).where((w) => w.whereNull('last_reminded_at').orWhere('last_reminded_at', '<', cutoff)).update({ last_reminded_at: new Date() });
    if (!claimed) { skipped++; continue; }
    const html = group === 'memberships_due'
      ? `<p>Hi ${esc(row.name)},</p><p>${row.status === 'pending' ? 'Your SSA membership payment was never completed.' : row.expiry_date && ymdOf(row.expiry_date) < todayYmd() ? `Your SSA membership ended on ${ymdOf(row.expiry_date)}.` : `Your SSA membership ends on ${ymdOf(row.expiry_date)}.`} Renew for ₹${DEFAULT_DUES} to keep member prices and members-only events.</p>${siteLink('/me', 'Renew membership')}`
      : `<p>Hi ${esc(row.name)},</p><p>Your SSA merch order #${id} (₹${Number(row.total)}) is waiting for payment. Unpaid orders are released after ${env.PENDING_HOLD_MINUTES} minutes.</p>${siteLink('/me', 'See your order')}`;
    await sendMail({ to: row.email, subject: group === 'memberships_due' ? 'Renew your SSA membership' : `Your SSA order #${id} is waiting for payment`, html })
      .catch((err) => logger.error({ err, group, id }, 'dues reminder failed'));
    sent++;
  }
  return { sent, skipped };
}
