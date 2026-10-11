import type { Knex } from 'knex';
import { getDb, lockRow } from '../../config/db';
import { appUrl, env } from '../../config/env';
import { HttpError, conflict, forbidden, notFound } from '../../lib/errors';
import { qrDataUrl, signTicketQr, verifyQr } from '../../lib/qr';
import { sendMail, siteLink } from '../../lib/email';
import { logger } from '../../lib/logger';
import { recordEntry, reversePaymentIncome } from '../finance/service';
import { checkoutFor, createCashPayment, createPendingPayment } from '../payments/service';
import { membershipRequired } from '../../middleware/auth';
import { isActiveMember } from '../memberships/service';

const HELD = ['pending', 'confirmed', 'checked_in'];
const escapeHtml = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** `created_at` comes from the DB default: DATETIME on MySQL, 'YYYY-MM-DD HH:MM:SS' (UTC) text on SQLite — a JS Date binds as epoch ms there. */
const createdAtBound = (db: Knex, d: Date) => (db.client.config.client === 'mysql2' ? d : d.toISOString().replace('T', ' ').slice(0, 19));
const round2 = (n: number) => Math.round(n * 100) / 100;

type Viewer = { logged_in: boolean; is_member: boolean; registered: boolean; ticket: { id: number; status: string } | null };

/** Public list. Drafts only for admins. Each event carries seats_left and, for the caller, a `viewer` block. */
export async function listEvents(user?: { id: number }, includeDrafts = false) {
  const db = getDb();
  const rows = await db('events').modify((qb) => { if (!includeDrafts) qb.whereNot('status', 'draft'); }).orderBy('starts_at', 'asc');
  const held = await heldCounts(db, rows.map((e: any) => e.id));
  const viewer = await viewerFor(db, user?.id, rows.map((e: any) => e.id));
  return rows.map((e: any) => withAvailability(e, held.get(e.id) ?? 0, viewer(e.id)));
}

export async function getEvent(id: number, user?: { id: number }, includeDrafts = false) {
  const db = getDb();
  const e = await db('events').where({ id }).first();
  if (!e || (!includeDrafts && e.status === 'draft')) throw notFound('Event not found');
  const held = await heldCounts(db, [id]);
  return withAvailability(e, held.get(id) ?? 0, (await viewerFor(db, user?.id, [id]))(id));
}

async function heldCounts(db: Knex, ids: number[]) {
  if (!ids.length) return new Map<number, number>();
  const rows = await db('tickets').whereIn('event_id', ids).whereIn('status', HELD).select('event_id').count({ n: '*' }).groupBy('event_id');
  return new Map(rows.map((r: any) => [Number(r.event_id), Number(r.n)]));
}

/** One query for the caller's membership and one for their tickets, however many events are listed. */
async function viewerFor(db: Knex, user_id: number | undefined, ids: number[]): Promise<(event_id: number) => Viewer> {
  if (!user_id) return () => ({ logged_in: false, is_member: false, registered: false, ticket: null });
  const is_member = await isActiveMember(db, user_id);
  const tickets = ids.length ? await db('tickets').where({ holder_user_id: user_id }).whereIn('event_id', ids).whereNot('status', 'cancelled').select('id', 'event_id', 'status') : [];
  const byEvent = new Map(tickets.map((t: any) => [Number(t.event_id), t]));
  return (event_id) => {
    const t = byEvent.get(event_id);
    return { logged_in: true, is_member, registered: !!t && t.status !== 'pending', ticket: t ? { id: t.id, status: t.status } : null };
  };
}

/** The price this caller would pay: members the member price, others the non-member price, or null when only members can register. */
const priceFor = (e: any, is_member: boolean) => (is_member ? Number(e.member_price) : e.members_only ? null : Number(e.non_member_price));
/** `price` stays the member price (older clients read it); `price_for_you` is what the caller pays (signed-out callers see the non-member price). */
const withAvailability = (e: any, held: number, viewer: Viewer) => ({
  ...e, members_only: !!e.members_only, member_price: Number(e.member_price), non_member_price: Number(e.non_member_price),
  seats_left: Math.max(0, e.capacity - held), price: Number(e.member_price), price_for_you: priceFor(e, viewer.is_member), viewer,
});

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

/**
 * POST /events/:id/register — any signed-in user. Membership is checked under the lock: members get a 'member' ticket at
 * member_price, others a 'non_member' ticket at non_member_price, or 403 MEMBERSHIP_REQUIRED on a members_only event. One ticket per user
 * per event (UNIQUE(event_id, holder_user_id)): a cancelled row is reused, a pending one resumes its checkout.
 * Capacity is enforced under the event row lock; the pending ticket holds the seat while the payment is created after.
 */
export async function registerForEvent(event_id: number, user_id: number) {
  const db = getDb();
  type Hold = { done: any } | { resume: any; payment: any } | { ticket_id: number; price: number };
  const hold = await db.transaction(async (trx): Promise<Hold> => {
    const e = await lockRow(trx('events').where({ id: event_id })).first();
    if (!e || e.status !== 'published') throw notFound('Event not open for registration');
    const now = new Date();
    if (new Date(e.starts_at) <= now) throw new HttpError(400, 'Event has already started', 'REGISTRATION_CLOSED');
    if (e.sales_open_at && new Date(e.sales_open_at) > now) throw new HttpError(400, 'Registration is not open yet', 'REGISTRATION_NOT_OPEN');
    if (e.sales_close_at && new Date(e.sales_close_at) < now) throw new HttpError(400, 'Registration has closed', 'REGISTRATION_CLOSED');
    const is_member = await isActiveMember(trx, user_id);
    if (!is_member && e.members_only) throw membershipRequired();
    const ticket_type = is_member ? 'member' : 'non_member';

    const existing = await trx('tickets').where({ event_id, holder_user_id: user_id }).first();
    if (existing && ['confirmed', 'checked_in'].includes(existing.status)) throw conflict('You are already registered for this event', 'ALREADY_REGISTERED', { ticket_id: existing.id });
    if (existing?.status === 'pending') {
      const payment = existing.payment_id ? await trx('payments').where({ id: existing.payment_id }).first() : null;
      // Same price as before: resume that checkout. If the user has since become a member (or lapsed), the held seat
      // is re-priced below and the stale checkout is dropped, so it can't settle at the old price.
      if (payment?.status === 'pending' && existing.ticket_type === ticket_type) return { resume: existing, payment };
      if (payment?.status === 'pending') await trx('payments').where({ id: payment.id }).update({ status: 'failed' });
    }
    if (existing?.status !== 'pending') {
      const [{ held }] = await trx('tickets').where({ event_id }).whereIn('status', HELD).count({ held: '*' });
      if (Number(held) >= e.capacity) throw conflict('This event is sold out', 'SOLD_OUT');
    }

    const u = await trx('users').where({ id: user_id }).first();
    const price = Number(is_member ? e.member_price : e.non_member_price);
    const row = { holder_name: u.name, holder_email: u.email, ticket_type, price, status: 'pending', payment_id: null, qr_token: null, checked_in_at: null, checked_in_by: null };
    let ticket_id: number;
    if (existing) {
      // created_at restarts the hold window (the expiry job compares it); fn.now() writes the DB's own format.
      await trx('tickets').where({ id: existing.id }).update({ ...row, created_at: trx.fn.now(), updated_at: trx.fn.now() });
      ticket_id = existing.id;
    } else {
      [ticket_id] = await trx('tickets').insert({ event_id, holder_user_id: user_id, ...row });
    }
    if (price === 0) {
      const payment_id = await createCashPayment(trx, { user_id, amount: 0, purpose: 'ticket', reference_type: 'ticket', reference_id: ticket_id });
      return { done: await confirmTicket(trx, ticket_id, payment_id) };
    }
    return { ticket_id, price }; // seat is held by the committed pending ticket
  });
  if ('done' in hold) return { ticket: hold.done, checkout: null, resumed: false };
  if ('resume' in hold) return { ticket: hold.resume, checkout: checkoutFor(hold.payment), resumed: true };
  // The provider order (an HTTP call to Razorpay) is created after the event row lock is released, so a slow or hung
  // gateway no longer serialises every registration for the event. If it fails, release the seat straight away.
  try {
    return await db.transaction(async (trx) => {
      const { payment_id, checkout } = await createPendingPayment(trx, { user_id, amount: hold.price, purpose: 'ticket', reference_type: 'ticket', reference_id: hold.ticket_id });
      await trx('tickets').where({ id: hold.ticket_id }).update({ payment_id });
      return { ticket: await trx('tickets').where({ id: hold.ticket_id }).first(), checkout, resumed: false };
    });
  } catch (err) {
    await db('tickets').where({ id: hold.ticket_id, status: 'pending' }).update({ status: 'cancelled' });
    throw err;
  }
}

/**
 * DELETE /events/:id/register — the holder cancels before the event starts and the seat is freed. A paid ticket gets a
 * reversing ledger row and its payment is marked refunded (the money itself goes back through Razorpay or in cash).
 */
export async function cancelRegistration(event_id: number, user_id: number) {
  return getDb().transaction(async (trx) => {
    const e = await lockRow(trx('events').where({ id: event_id })).first();
    if (!e) throw notFound('Event not found');
    const t = await trx('tickets').where({ event_id, holder_user_id: user_id }).first();
    if (!t || t.status === 'cancelled') throw notFound('You are not registered for this event');
    if (t.status === 'checked_in') throw conflict('Ticket was already used at the door', 'ALREADY_CHECKED_IN');
    if (new Date(e.starts_at) <= new Date()) throw new HttpError(400, 'The event has already started', 'EVENT_STARTED');
    await trx('tickets').where({ id: t.id }).update({ status: 'cancelled', qr_token: null, updated_at: trx.fn.now() });
    const payment = t.payment_id ? await trx('payments').where({ id: t.payment_id }).first() : null;
    if (t.status === 'confirmed' && payment?.status === 'paid' && Number(payment.amount) > 0) {
      await reversePaymentIncome(trx, payment.id, `Refund due: ticket #${t.id} cancelled by holder`, user_id);
      await trx('payments').where({ id: payment.id }).update({ status: 'refunded' });
    }
    return trx('tickets').where({ id: t.id }).first();
  });
}

/** GET /admin/events/:id/registrations */
export async function eventRegistrations(event_id: number) {
  const db = getDb();
  if (!(await db('events').where({ id: event_id }).first())) throw notFound('Event not found');
  return db('tickets as t').leftJoin('users as u', 'u.id', 't.holder_user_id').leftJoin('payments as p', 'p.id', 't.payment_id')
    .where('t.event_id', event_id)
    .select('t.id', 't.created_at', 't.holder_user_id', 't.holder_name', 't.holder_email', 't.ticket_type', 't.price', 't.status', 't.checked_in_at', 'u.name as user_name', 'p.status as payment_status')
    .orderBy('t.id', 'asc');
}

/** Called only from settlePayment (webhook, demo-confirm) and free registrations. Issues the signed QR and writes the ledger entry. */
export async function confirmTicket(trx: Knex.Transaction, ticket_id: number, payment_id: number, entered_by?: number | null) {
  const t = await trx('tickets').where({ id: ticket_id }).first();
  if (!t) throw notFound('Ticket not found');
  const e = await trx('events').where({ id: t.event_id }).first();
  const recordIncome = (memo = `Ticket #${ticket_id} ${e.title}`) => Number(t.price) > 0
    ? recordEntry(trx, { direction: 'in', amount: Number(t.price), category: 'ticket', source_type: 'payment', source_id: payment_id, event_id: t.event_id, memo, entered_by: entered_by ?? t.holder_user_id })
    : undefined;
  if (t.status === 'cancelled') {
    // Payment captured after the 15-min hold expired. The money was received, so it must reach the ledger
    // (§4.3 inv. 4); re-issue the seat only if capacity still allows (same row lock as registerForEvent), else leave it for a refund.
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
  sendMail({ to: t.holder_email, subject: `Your ticket: ${e.title}`, html: `<p>Hi ${escapeHtml(t.holder_name)}, you're in for ${escapeHtml(e.title)}. Show this QR at the door.</p><img src="${qr}" alt="QR"/>${siteLink(`/tickets/${ticket_id}`, 'Open your ticket')}` })
    .catch((err) => logger.error({ err, ticket_id }, 'ticket email failed'));
  return confirmed;
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
  // Ticket revenue per type: the price of each ticket still held (refunded tickets are cancelled, so they drop out).
  const typeRevenue = await db('tickets').where({ event_id }).whereIn('status', ['confirmed', 'checked_in']).select('ticket_type').sum({ total: 'price' }).groupBy('ticket_type');
  const split = (type: string) => ({
    sold: n((r) => r.ticket_type === type && ['confirmed', 'checked_in'].includes(r.status)),
    checked_in: n((r) => r.ticket_type === type && r.status === 'checked_in'),
    revenue: round2(Number(typeRevenue.find((r: any) => r.ticket_type === type)?.total ?? 0)),
  });
  const sold = n((r) => ['confirmed', 'checked_in'].includes(r.status));
  const checked_in = n((r) => r.status === 'checked_in');
  return {
    event: { ...e, members_only: !!e.members_only }, sold, checked_in, no_show: sold - checked_in, pending: n((r) => r.status === 'pending'), cancelled: n((r) => r.status === 'cancelled'),
    by_type: { member: n((r) => r.ticket_type === 'member' && ['confirmed', 'checked_in'].includes(r.status)), non_member: n((r) => r.ticket_type === 'non_member' && ['confirmed', 'checked_in'].includes(r.status)) },
    split: { member: split('member'), non_member: split('non_member') },
    revenue, spent, breakdown,
  };
}

/** Job: cancel pending tickets older than the hold window (payment stays pending/failed). */
export async function expirePendingTickets(db: Knex = getDb()) {
  const cutoff = new Date(Date.now() - env.PENDING_HOLD_MINUTES * 60_000);
  return db('tickets').where({ status: 'pending' }).where('created_at', '<', createdAtBound(db, cutoff)).update({ status: 'cancelled' });
}

/** "Sat 24 Oct, 10:00 am" in the club's time zone (emails are read wherever the member is). */
const clubTime = (d: Date) => new Intl.DateTimeFormat('en-IN', { timeZone: env.APP_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(d);
/** Events have no end time; calendars get this long a slot. */
export const EVENT_DEFAULT_HOURS = 2;

/**
 * Hourly job: confirmed tickets whose event starts in 23–25 hours get one "Tomorrow" email. Each ticket is claimed by a
 * conditional update on `reminder_sent_at` before the email goes out, so overlapping runs (or a retry) never send twice.
 * The two-hour window means an hourly run always catches every event once.
 */
export async function sendEventReminders(now = new Date()) {
  const db = getDb();
  const from = new Date(now.getTime() + 23 * 3600_000), to = new Date(now.getTime() + 25 * 3600_000);
  const rows = await db('tickets as t').join('events as e', 'e.id', 't.event_id')
    .where('t.status', 'confirmed').whereNull('t.reminder_sent_at').whereNot('e.status', 'draft')
    .where('e.starts_at', '>=', from).where('e.starts_at', '<=', to)
    .select('t.id', 't.holder_name', 't.holder_email', 'e.title', 'e.starts_at', 'e.venue');
  let sent = 0;
  for (const r of rows) {
    const claimed = await db('tickets').where({ id: r.id }).whereNull('reminder_sent_at').update({ reminder_sent_at: new Date() });
    if (!claimed || !r.holder_email) continue;
    const when = clubTime(new Date(r.starts_at));
    await sendMail({
      to: r.holder_email,
      subject: `Tomorrow: ${r.title} at ${when.split(', ').pop()}${r.venue ? `, ${r.venue}` : ''}`,
      html: `<p>Hi ${escapeHtml(r.holder_name)},</p><p><b>${escapeHtml(r.title)}</b> is tomorrow, ${escapeHtml(when)}${r.venue ? ` at ${escapeHtml(r.venue)}` : ''}. Keep your ticket QR ready at the door.</p>${siteLink(`/tickets/${r.id}`, 'Open your ticket')}`,
    });
    sent++;
  }
  if (sent) logger.info({ sent }, 'event reminders sent');
  return sent;
}

/** iCalendar TEXT escaping (RFC 5545 §3.3.11): backslash, semicolon, comma, newlines. */
const icsText = (s: unknown) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** Lines over 75 octets are folded: CRLF plus a space. */
const fold = (line: string) => {
  const out: string[] = []; let cur = '';
  for (const ch of line) { if (Buffer.byteLength(cur + ch) > 75) { out.push(cur); cur = ` ${ch}`; } else cur += ch; }
  return [...out, cur].join('\r\n');
};

/** GET /tickets/:id/calendar.ics — the holder's own ticket as one VEVENT (UTC times, 2 hours long). */
export async function ticketCalendar(id: number, user_id: number) {
  const t = await getDb()('tickets as t').join('events as e', 'e.id', 't.event_id').where('t.id', id)
    .select('t.id', 't.holder_user_id', 't.status', 'e.title', 'e.description', 'e.starts_at', 'e.venue').first();
  if (!t) throw notFound('Ticket not found');
  if (Number(t.holder_user_id) !== user_id) throw forbidden('Only the ticket holder can add it to a calendar');
  const start = new Date(t.starts_at), end = new Date(start.getTime() + EVENT_DEFAULT_HOURS * 3600_000);
  const url = appUrl(`/tickets/${t.id}`);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Skyline Student Association//Tickets//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:ticket-${t.id}@skyline`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(t.title)}`,
    ...(t.venue ? [`LOCATION:${icsText(t.venue)}`] : []),
    `DESCRIPTION:${icsText(`${t.description ? `${t.description}\n\n` : ''}Your ticket: ${url}`)}`,
    `URL:${url}`,
    `STATUS:${t.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** GET /me/upcoming — the caller's confirmed tickets for events that haven't started, soonest first. */
export const myUpcoming = (user_id: number) =>
  getDb()('tickets as t').join('events as e', 'e.id', 't.event_id').where('t.holder_user_id', user_id).where('t.status', 'confirmed').where('e.starts_at', '>', new Date())
    .select('t.id', 't.event_id', 't.ticket_type', 't.price', 'e.title as event_title', 'e.starts_at', 'e.venue').orderBy('e.starts_at', 'asc');
