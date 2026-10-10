import type { Knex } from 'knex';
import { getDb, lockRow } from '../../config/db';
import { env } from '../../config/env';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { qrDataUrl, signTicketQr, verifyQr } from '../../lib/qr';
import { sendMail } from '../../lib/email';
import { logger } from '../../lib/logger';
import { recordEntry } from '../finance/service';
import { createCashPayment, createPendingPayment } from '../payments/service';
import { isActiveMember } from '../memberships/service';

const HELD = ['pending', 'confirmed', 'checked_in'];
const escapeHtml = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** `created_at` comes from the DB default: DATETIME on MySQL, 'YYYY-MM-DD HH:MM:SS' (UTC) text on SQLite — a JS Date binds as epoch ms there. */
const createdAtBound = (db: Knex, d: Date) => (db.client.config.client === 'mysql2' ? d : d.toISOString().replace('T', ' ').slice(0, 19));
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function listEvents(user?: { id: number }, includeDrafts = false) {
  const db = getDb();
  const rows = await db('events').modify((qb) => { if (!includeDrafts) qb.whereNot('status', 'draft'); }).orderBy('starts_at', 'asc');
  const member = await isActiveMember(db, user?.id);
  return Promise.all(rows.map((e: any) => withAvailability(db, e, member)));
}

export async function getEvent(id: number, user?: { id: number }, includeDrafts = false) {
  const db = getDb();
  const e = await db('events').where({ id }).first();
  if (!e || (!includeDrafts && e.status === 'draft')) throw notFound('Event not found');
  return withAvailability(db, e, await isActiveMember(db, user?.id));
}

async function withAvailability(db: Knex, e: any, member: boolean) {
  const [{ held }] = await db('tickets').where({ event_id: e.id }).whereIn('status', HELD).count({ held: '*' });
  return { ...e, seats_left: Math.max(0, e.capacity - Number(held)), price_for_you: Number(member ? e.member_price : e.non_member_price), you_are_member: member };
}

export async function createEvent(input: any) {
  const [id] = await getDb()('events').insert(input);
  return getDb()('events').where({ id }).first();
}
export async function updateEvent(id: number, input: any) {
  // An empty PATCH body made knex throw "Empty .update() call" → 500.
  const n = Object.keys(input).length ? await getDb()('events').where({ id }).update(input) : (await getDb()('events').where({ id }).first()) ? 1 : 0;
  if (!n) throw notFound('Event not found');
  return getDb()('events').where({ id }).first();
}

/** §6.1 — capacity enforced under a row lock on the event (the pending ticket holds the seat); payment created after. */
export async function buyTicket(event_id: number, user: { id: number; email: string } | undefined, body: { holder_name?: string; holder_email?: string }) {
  const db = getDb();
  const hold = await db.transaction(async (trx): Promise<{ done: { ticket: any; checkout: null } } | { ticket_id: number; price: number }> => {
    const e = await lockRow(trx('events').where({ id: event_id })).first();
    if (!e || e.status !== 'published') throw notFound('Event not on sale');
    const now = new Date();
    if (e.sales_open_at && new Date(e.sales_open_at) > now) throw badRequest('Sales not open yet');
    if (e.sales_close_at && new Date(e.sales_close_at) < now) throw badRequest('Sales closed');
    const [{ held }] = await trx('tickets').where({ event_id }).whereIn('status', HELD).count({ held: '*' });
    if (Number(held) >= e.capacity) throw conflict('Sold out');

    let holder_name = body.holder_name, holder_email = body.holder_email;
    const member = await isActiveMember(trx, user?.id);
    if (user) {
      const u = await trx('users').where({ id: user.id }).first();
      holder_name ??= u.name; holder_email ??= u.email;
    }
    if (!holder_name || !holder_email) throw badRequest('Name and email are required');
    const ticket_type = member ? 'member' : 'non_member';
    const price = Number(member ? e.member_price : e.non_member_price);

    const [ticket_id] = await trx('tickets').insert({ event_id, holder_user_id: user?.id ?? null, holder_name, holder_email, ticket_type, price, status: 'pending' });
    if (price === 0) {
      const payment_id = await createCashPayment(trx, { user_id: user?.id ?? null, amount: 0, purpose: 'ticket', reference_type: 'ticket', reference_id: ticket_id as number });
      const t = await confirmTicket(trx, ticket_id as number, payment_id);
      return { done: { ticket: t, checkout: null } };
    }
    return { ticket_id: ticket_id as number, price }; // seat is held by the committed pending ticket
  });
  if ('done' in hold) return hold.done;
  // The provider order (an HTTP call to Razorpay) is created after the event row lock is released, so a slow or hung
  // gateway no longer serialises every purchase for the event. If it fails, release the seat straight away.
  try {
    return await db.transaction(async (trx) => {
      const { payment_id, checkout } = await createPendingPayment(trx, { user_id: user?.id ?? null, amount: hold.price, purpose: 'ticket', reference_type: 'ticket', reference_id: hold.ticket_id });
      await trx('tickets').where({ id: hold.ticket_id }).update({ payment_id });
      return { ticket: await trx('tickets').where({ id: hold.ticket_id }).first(), checkout };
    });
  } catch (err) {
    await db('tickets').where({ id: hold.ticket_id, status: 'pending' }).update({ status: 'cancelled' });
    throw err;
  }
}

/** Called only from the payment webhook / cash entry. Issues the signed QR and writes the ledger entry. */
export async function confirmTicket(trx: Knex.Transaction, ticket_id: number, payment_id: number, entered_by?: number | null) {
  const t = await trx('tickets').where({ id: ticket_id }).first();
  if (!t) throw notFound('Ticket not found');
  const e = await trx('events').where({ id: t.event_id }).first();
  const recordIncome = (memo = `Ticket #${ticket_id} ${e.title}`) => Number(t.price) > 0
    ? recordEntry(trx, { direction: 'in', amount: Number(t.price), category: 'ticket', source_type: 'payment', source_id: payment_id, event_id: t.event_id, memo, entered_by: entered_by ?? t.holder_user_id })
    : undefined;
  if (t.status === 'cancelled') {
    // Payment captured after the 15-min hold expired. The money was received, so it must reach the ledger
    // (§4.3 inv. 4); re-issue the seat only if capacity still allows (same row lock as buyTicket), else leave it for a refund.
    await lockRow(trx('events').where({ id: t.event_id })).first();
    const [{ held }] = await trx('tickets').where({ event_id: t.event_id }).whereIn('status', HELD).count({ held: '*' });
    if (Number(held) >= e.capacity) {
      await recordIncome(`Ticket #${ticket_id} ${e.title}: hold expired and event full, refund due`);
      logger.error({ ticket_id, payment_id }, 'late payment for cancelled ticket and event is full: refund due');
      return t;
    }
  } else if (t.status !== 'pending') return t;
  const exp = new Date(new Date(e.starts_at).getTime() + 24 * 3600 * 1000);
  const qr_token = signTicketQr({ tid: ticket_id, eid: t.event_id }, exp);
  await trx('tickets').where({ id: ticket_id }).update({ status: 'confirmed', payment_id, qr_token });
  await recordIncome();
  const confirmed = await trx('tickets').where({ id: ticket_id }).first();
  const qr = await qrDataUrl(qr_token);
  // Fire-and-forget, but never as an unhandled rejection (a network error would crash the process).
  sendMail({ to: t.holder_email, subject: `Your ticket: ${e.title}`, html: `<p>Hi ${escapeHtml(t.holder_name)}, show this QR at the door.</p><img src="${qr}" alt="QR"/>` })
    .catch((err) => logger.error({ err, ticket_id }, 'ticket email failed'));
  return confirmed;
}

/** Treasurer/admin door sale for cash. */
export async function sellCashTicket(seller_id: number, event_id: number, body: { holder_name: string; holder_email: string; member_id?: number }) {
  const db = getDb();
  return db.transaction(async (trx) => {
    const e = await lockRow(trx('events').where({ id: event_id })).first();
    if (!e || e.status === 'draft') throw notFound('Event not found');
    const [{ held }] = await trx('tickets').where({ event_id }).whereIn('status', HELD).count({ held: '*' });
    if (Number(held) >= e.capacity) throw conflict('Sold out');
    let holder_user_id: number | null = null, member = false;
    if (body.member_id) {
      const m = await trx('members').where({ id: body.member_id }).first();
      if (m) { holder_user_id = m.user_id; member = await isActiveMember(trx, m.user_id); }
    }
    const price = Number(member ? e.member_price : e.non_member_price);
    const [ticket_id] = await trx('tickets').insert({ event_id, holder_user_id, holder_name: body.holder_name, holder_email: body.holder_email, ticket_type: member ? 'member' : 'non_member', price, status: 'pending' });
    const payment_id = await createCashPayment(trx, { user_id: seller_id, amount: price, purpose: 'ticket', reference_type: 'ticket', reference_id: ticket_id as number });
    // Ledger `entered_by` is whoever took the cash, not the (often anonymous) holder.
    return confirmTicket(trx, ticket_id as number, payment_id, seller_id);
  });
}

export async function getTicket(id: number, user: { id: number; role: string }) {
  const t = await getDb()('tickets as t').join('events as e', 'e.id', 't.event_id').select('t.*', 'e.title as event_title', 'e.starts_at', 'e.venue').where('t.id', id).first();
  if (!t) throw notFound('Ticket not found');
  // holder/admin only (§5). Volunteers could otherwise enumerate ids and read every holder's QR token.
  if (Number(t.holder_user_id) !== user.id && user.role !== 'admin') throw forbidden();
  return { ...t, qr_data_url: t.qr_token ? await qrDataUrl(t.qr_token) : null };
}

export const myTickets = (user_id: number) =>
  getDb()('tickets as t').join('events as e', 'e.id', 't.event_id').select('t.*', 'e.title as event_title', 'e.starts_at', 'e.venue').where('t.holder_user_id', user_id).orderBy('e.starts_at', 'desc');

/** Door scan: signature verify + one conditional UPDATE. Safe against double scans. */
export async function checkIn(scanner_id: number, qr_token: string, event_id?: number) {
  const p = verifyQr<{ tid: number; eid: number }>(qr_token, 'ticket');
  if (!p) return { ok: false, reason: 'Invalid or expired QR' };
  if (event_id && p.eid !== event_id) return { ok: false, reason: 'Ticket is for a different event' };
  const db = getDb();
  const n = await db('tickets').where({ id: p.tid, status: 'confirmed' }).update({ status: 'checked_in', checked_in_at: new Date(), checked_in_by: scanner_id });
  const t = await db('tickets').where({ id: p.tid }).first();
  if (!t) return { ok: false, reason: 'Unknown ticket' };
  if (n === 0) return { ok: false, reason: t.status === 'checked_in' ? `Already used at ${t.checked_in_at ? new Date(t.checked_in_at).toISOString() : 'an earlier scan'}` : `Ticket is ${t.status}`, ticket: pub(t) };
  const member = await isActiveMember(db, t.holder_user_id ?? undefined);
  return { ok: true, ticket: pub(t), membership_active: member };
}
const pub = (t: any) => ({ id: t.id, holder_name: t.holder_name, ticket_type: t.ticket_type, status: t.status, event_id: t.event_id });

/** GROUP BY ticket_type, status + SUM on ledger where event_id. */
export async function eventReport(event_id: number) {
  const db = getDb();
  const e = await db('events').where({ id: event_id }).first();
  if (!e) throw notFound('Event not found');
  const breakdown = await db('tickets').where({ event_id }).select('ticket_type', 'status').count({ n: '*' }).groupBy('ticket_type', 'status');
  const n = (f: (r: any) => boolean) => breakdown.filter(f).reduce((s, r: any) => s + Number(r.n), 0);
  // Net of reversals: a reversal keeps the original category with the opposite direction, so income
  // categories net as in−out and reimbursements as out−in (a reversed ticket sale no longer counts as revenue + spend).
  const sums = await db('ledger_entries').where({ event_id }).select('category', 'direction').sum({ total: 'amount' }).groupBy('category', 'direction');
  const net = (pred: (r: any) => boolean) => sums.filter(pred).reduce((s, r: any) => s + (r.direction === 'in' ? 1 : -1) * Number(r.total ?? 0), 0);
  const revenue = round2(net((r) => r.category !== 'reimbursement'));
  const spent = round2(-net((r) => r.category === 'reimbursement'));
  const sold = n((r) => ['confirmed', 'checked_in'].includes(r.status));
  const checked_in = n((r) => r.status === 'checked_in');
  return {
    event: e, sold, checked_in, no_show: sold - checked_in, pending: n((r) => r.status === 'pending'), cancelled: n((r) => r.status === 'cancelled'),
    by_type: { member: n((r) => r.ticket_type === 'member' && ['confirmed', 'checked_in'].includes(r.status)), non_member: n((r) => r.ticket_type === 'non_member' && ['confirmed', 'checked_in'].includes(r.status)) },
    revenue, spent, breakdown,
  };
}

/** Job: cancel pending tickets older than the hold window (payment stays pending/failed). */
export async function expirePendingTickets(db: Knex = getDb()) {
  const cutoff = new Date(Date.now() - env.PENDING_HOLD_MINUTES * 60_000);
  return db('tickets').where({ status: 'pending' }).where('created_at', '<', createdAtBound(db, cutoff)).update({ status: 'cancelled' });
}
