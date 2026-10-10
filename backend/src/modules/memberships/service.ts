import type { Knex } from 'knex';
import { getDb, lockRow } from '../../config/db';
import { env } from '../../config/env';
import { HttpError, badRequest, conflict, notFound } from '../../lib/errors';
import { signMemberQr, verifyQr } from '../../lib/qr';
import { addDaysYmd, todayYmd, ymdInTz, ymdOf } from '../../lib/dates';
import { recordEntry } from '../finance/service';
import { sendMail, siteLink } from '../../lib/email';
import { createCashPayment, createPendingPayment } from '../payments/service';
import { DEFAULT_DUES } from './schemas';
import bcrypt from 'bcryptjs';
import { appUrl } from '../../config/env';
import { randomToken } from '../../lib/hash';
import { logger } from '../../lib/logger';
import { createAccount, createPasswordToken, passwordLink, publicUser, SETUP_TTL_MINUTES } from '../auth/service';
import { logAuditEvent } from '../audit/service';

/** Today in the club's time zone (APP_TIMEZONE) — the UTC date lags IST until 05:30. */
const today = todayYmd;
/** A member can renew online once their membership is this close to expiring. */
export const RENEW_WINDOW_DAYS = 30;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Academic year end: next occurrence of MEMBERSHIP_YEAR_END (MM-DD) after `from`'s calendar day in the club's time zone. */
export function academicYearEnd(from = new Date()): string {
  const day = ymdInTz(from);
  const year = Number(day.slice(0, 4));
  const end = `${year}-${env.MEMBERSHIP_YEAR_END}`;
  return end > day ? end : `${year + 1}-${env.MEMBERSHIP_YEAR_END}`;
}

/** The paid period covering today (a renewal paid ahead starts later, so it isn't this one yet). */
export async function currentMembership(db: Knex, member_id: number) {
  return db('memberships').where({ member_id, status: 'active' }).andWhere('start_date', '<=', today()).andWhere('expiry_date', '>=', today()).orderBy('expiry_date', 'desc').first();
}

/** The paid period that ends last, including one paid ahead: renewals and extensions start the day after it. */
export async function latestPaidMembership(db: Knex, member_id: number) {
  return db('memberships').where({ member_id, status: 'active' }).andWhere('expiry_date', '>=', today()).orderBy('expiry_date', 'desc').first();
}

export const memberForUser = (db: Knex, user_id: number) => db('members').where({ user_id }).first();

export async function isActiveMember(db: Knex, user_id: number | undefined) {
  if (!user_id) return false;
  const m = await memberForUser(db, user_id);
  return !!m && !!(await currentMembership(db, m.id));
}

/**
 * POST /memberships — start online dues payment. The amount is the club's dues, never a client-supplied number
 * (the webhook only checks the captured amount against this payment row, so a client amount of ₹1 would buy a membership).
 */
export async function startDues(user_id: number, profile: { student_id?: string; phone?: string } = {}) {
  const db = getDb();
  return db.transaction(async (trx) => {
    // Lock the member row so two clicks / tabs can't both pass the checks below.
    let member = await lockRow(trx('members').where({ user_id })).first();
    if (!member) {
      // Signed up without a student ID: take it with the first membership purchase instead of sending them elsewhere.
      if (!profile.student_id) throw new HttpError(400, 'Add your student ID to buy a membership', 'PROFILE_REQUIRED');
      if (await trx('members').where({ student_id: profile.student_id }).first()) throw conflict('Student ID already registered', 'STUDENT_ID_TAKEN');
      await trx('members').insert({ user_id, student_id: profile.student_id, phone: profile.phone ?? null, joined_at: today() });
      member = await lockRow(trx('members').where({ user_id })).first();
    }
    // Renewal: within RENEW_WINDOW_DAYS of expiry the member can pay for the next period, which starts the day after
    // the current one ends. Earlier than that, they're already covered.
    const current = await latestPaidMembership(trx, member.id);
    if (current && ymdOf(current.expiry_date) > addDaysYmd(today(), RENEW_WINDOW_DAYS)) throw conflict('Membership already active', 'ALREADY_MEMBER');
    const start = current ? addDaysYmd(ymdOf(current.expiry_date), 1) : today();
    const expiry_date = academicYearEnd(new Date(`${start}T12:00:00Z`));
    // Reuse an abandoned pending membership instead of piling up rows: the admin list shows the latest row, and two pending
    // rows could each be paid and activated, silently charging the member twice.
    const pending = await trx('memberships').where({ member_id: member.id, status: 'pending' }).orderBy('id', 'desc').first();
    let membership_id: number;
    if (pending) {
      membership_id = pending.id;
      await trx('memberships').where({ id: membership_id }).update({ start_date: start, expiry_date });
    } else {
      [membership_id] = await trx('memberships').insert({ member_id: member.id, start_date: start, expiry_date, status: 'pending' });
    }
    const { payment_id, checkout } = await createPendingPayment(trx, { user_id, amount: DEFAULT_DUES, purpose: 'dues', reference_type: 'membership', reference_id: membership_id });
    await trx('memberships').where({ id: membership_id }).update({ payment_id });
    return { membership_id, payment_id, amount: DEFAULT_DUES, expiry_date, checkout };
  });
}

/**
 * Called from the payment webhook (or cash entry) — the only places a membership becomes active.
 * `entered_by` defaults to the payer; cash entry passes the admin who took the money.
 */
export async function activateMembership(trx: Knex.Transaction, membership_id: number, payment_id: number, entered_by?: number) {
  const m = await trx('memberships').where({ id: membership_id }).first();
  if (!m) throw notFound('Membership not found');
  if (m.status === 'active') return m;
  // A checkout opened before the academic year ended but paid after it would otherwise activate an already-expired membership.
  const expiry_date = ymdOf(m.expiry_date) < today() ? academicYearEnd() : ymdOf(m.expiry_date);
  // A renewal paid early keeps its future start (the day after the current period ends).
  const start_date = ymdOf(m.start_date) > today() ? ymdOf(m.start_date) : today();
  await trx('memberships').where({ id: membership_id }).update({ status: 'active', payment_id, start_date, expiry_date });
  const payment = await trx('payments').where({ id: payment_id }).first();
  const member = await trx('members').where({ id: m.member_id }).first();
  await recordEntry(trx, { direction: 'in', amount: Number(payment.amount), category: 'dues', source_type: 'payment', source_id: payment_id, memo: `Dues ${member?.student_id ?? ''}`, entered_by: entered_by ?? payment.user_id });
  return trx('memberships').where({ id: membership_id }).first();
}

/**
 * An admin records cash dues at the sign-up table. Without an active membership this starts one (until the academic
 * year ends, or `expiry_date`). With one it extends it: the new period starts the day after the current expiry and
 * runs to `expiry_date` or the following academic year end.
 */
export async function recordCashDues(admin_id: number, member_id: number, amount: number, expiry_date?: string, db: Knex = getDb()) {
  if (expiry_date && expiry_date < today()) throw badRequest('expiry_date is in the past');
  // Inside a caller's transaction (a walk-in sign-up) this is a savepoint, so it commits or rolls back with the caller.
  return db.transaction(async (trx) => {
    // Checks run under the member row lock so a double submit can't record the dues (and the ledger row) twice.
    const member = await lockRow(trx('members').where({ id: member_id })).first();
    if (!member) throw notFound('Member not found');
    const current = await latestPaidMembership(trx, member_id);
    const start = current ? addDaysYmd(ymdOf(current.expiry_date), 1) : today();
    const expiry = expiry_date ?? academicYearEnd(new Date(`${start}T12:00:00Z`));
    if (current && expiry <= ymdOf(current.expiry_date)) throw badRequest(`Membership already runs until ${ymdOf(current.expiry_date)}; pick a later expiry date`);
    const [membership_id] = await trx('memberships').insert({ member_id, start_date: start, expiry_date: expiry, status: 'pending' });
    // payments.user_id is the payer (the member); the admin is recorded as the ledger's entered_by.
    const payment_id = await createCashPayment(trx, { user_id: member.user_id, amount, purpose: 'dues', reference_type: 'membership', reference_id: membership_id as number });
    const m = await activateMembership(trx, membership_id as number, payment_id, admin_id);
    if (current) await trx('memberships').where({ id: membership_id }).update({ start_date: start }); // activation stamps today; an extension starts later
    return { ...m, start_date: start, extended: !!current };
  });
}

export async function listMembers(q: { status?: string; expiring_within_days?: number; q?: string }) {
  const db = getDb();
  const rows = await db('members as m')
    .join('users as u', 'u.id', 'm.user_id')
    .leftJoin('memberships as ms', function () {
      this.on('ms.member_id', 'm.id').andOn('ms.id', '=', db.raw('(SELECT MAX(id) FROM memberships WHERE member_id = m.id)'));
    })
    .modify((qb) => {
      if (q.q) qb.where((w) => w.where('u.name', 'like', `%${q.q}%`).orWhere('u.email', 'like', `%${q.q}%`).orWhere('m.student_id', 'like', `%${q.q}%`));
      if (q.status === 'none') qb.whereNull('ms.id');
      else if (q.status) qb.where('ms.status', q.status);
      if (q.expiring_within_days) {
        qb.where('ms.status', 'active').whereBetween('ms.expiry_date', [today(), addDaysYmd(today(), q.expiring_within_days)]);
      }
    })
    // Dues for the latest membership: what was paid, how (online or cash) and when.
    .leftJoin('payments as p', 'p.id', 'ms.payment_id')
    .select('m.id', 'm.student_id', 'm.phone', 'm.joined_at', 'u.name', 'u.email', 'u.role', 'ms.status as membership_status', 'ms.expiry_date', 'ms.start_date',
      'p.amount as dues_amount', 'p.provider as dues_provider', 'p.status as dues_status', 'p.paid_at as dues_paid_at')
    .orderBy('u.name');
  return rows;
}

/** GET /members/:id/verify — at-event check by member id / student_id / QR. */
export async function verifyMember(idOrStudent: string, qr_token?: string) {
  const db = getDb();
  let member;
  if (qr_token) {
    const p = verifyQr<{ uid: number }>(qr_token, 'member');
    if (!p) return { valid: false, reason: 'Invalid QR' };
    member = await memberForUser(db, p.uid);
  } else {
    // Student ID first (what the door page sends): a numeric student ID like "1024" used to match the member whose
    // *row id* is 1024 and verify the wrong person. The member-id lookup stays as a fallback for the `:id` contract.
    member = await db('members').where({ student_id: idOrStudent }).first();
    if (!member && /^\d+$/.test(idOrStudent)) member = await db('members').where({ id: Number(idOrStudent) }).first();
  }
  if (!member) return { valid: false, reason: 'Member not found' };
  const user = await db('users').where({ id: member.user_id }).first();
  const ms = await currentMembership(db, member.id);
  return { valid: !!ms, reason: ms ? undefined : 'No active membership', member: { id: member.id, student_id: member.student_id, name: user.name }, expiry_date: ms?.expiry_date };
}

export async function myMembership(user_id: number) {
  const db = getDb();
  const member = await memberForUser(db, user_id);
  if (!member) return { member: null, membership: null, active: false, is_member: false, membership_expires: null, days_left: null, can_renew: true, renewal: null, dues: [], qr_token: null };
  // The period covering today decides membership; the latest paid one (maybe a renewal paid ahead) says how far the
  // member is covered, which is what expiry, days left and renewal are based on.
  const ms = await currentMembership(db, member.id);
  const latest = await db('memberships').where({ member_id: member.id }).orderBy('id', 'desc').first();
  const paid = ms ? await latestPaidMembership(db, member.id) : null;
  const expires = paid ? ymdOf(paid.expiry_date) : null;
  const ahead = paid && ymdOf(paid.start_date) > today() ? paid : null;
  return {
    member, membership: ms ?? latest ?? null, active: !!ms,
    is_member: !!ms, membership_expires: expires,
    days_left: expires ? daysBetween(today(), expires) : null,
    // Renewal opens RENEW_WINDOW_DAYS before the covered-until date, and any time once expired.
    can_renew: !expires || expires <= addDaysYmd(today(), RENEW_WINDOW_DAYS),
    renewal: ahead ? { start_date: ymdOf(ahead.start_date), expiry_date: ymdOf(ahead.expiry_date) } : null,
    dues: await duesHistory(member.id),
    qr_token: ms ? signMemberQr({ uid: user_id }) : null,
  };
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Every membership period with its dues payment: amount, online or cash, paid or not, and when. Newest first. */
export async function duesHistory(member_id: number) {
  const rows = await getDb()('memberships as ms').leftJoin('payments as p', 'p.id', 'ms.payment_id').where('ms.member_id', member_id)
    .select('ms.id', 'ms.start_date', 'ms.expiry_date', 'ms.status', 'p.amount', 'p.provider', 'p.status as payment_status', 'p.paid_at')
    .orderBy('ms.id', 'desc');
  return rows.map((r) => ({
    membership_id: r.id, start_date: ymdOf(r.start_date), expiry_date: ymdOf(r.expiry_date), status: r.status,
    amount: r.amount == null ? null : Number(r.amount), method: r.provider == null ? null : r.provider === 'cash' ? 'cash' : 'online',
    paid: r.payment_status === 'paid', paid_at: r.paid_at ?? null,
  }));
}

/**
 * Admin sets the expiry of a member's current (or most recent paid) membership: correct a date, extend a period, or
 * end it early (expiry today). A past date is refused. Clears the reminder stamp so the renewal email goes out again.
 */
export async function setExpiry(member_id: number, expiry_date: string) {
  if (expiry_date < today()) throw badRequest('Expiry date is in the past');
  const db = getDb();
  return db.transaction(async (trx) => {
    const member = await lockRow(trx('members').where({ id: member_id })).first();
    if (!member) throw notFound('Member not found');
    // Only a paid period can be changed; a never-paid (pending) row stays as it is.
    const target = await trx('memberships').where({ member_id }).whereIn('status', ['active', 'expired']).orderBy('expiry_date', 'desc').first();
    if (!target) throw badRequest('This member has no paid membership. Record dues first.');
    if (expiry_date < ymdOf(target.start_date)) throw badRequest(`Expiry must be on or after the start date (${ymdOf(target.start_date)})`);
    await trx('memberships').where({ id: target.id }).update({ expiry_date, status: 'active', reminder_sent_at: null });
    return trx('memberships').where({ id: target.id }).first();
  });
}

/** Admin sends one member a renewal reminder now (the daily job sends them automatically 14 days out and on the day). */
export async function sendReminder(member_id: number) {
  const db = getDb();
  const member = await db('members as m').join('users as u', 'u.id', 'm.user_id').where('m.id', member_id).first('m.id', 'u.name', 'u.email');
  if (!member) throw notFound('Member not found');
  const ms = await currentMembership(db, member_id);
  const latest = ms ?? await db('memberships').where({ member_id }).whereIn('status', ['active', 'expired']).orderBy('expiry_date', 'desc').first();
  if (!latest) throw badRequest('This member has never had a membership');
  const exp = ymdOf(latest.expiry_date);
  const html = ms
    ? `<p>Hi ${esc(member.name)}, your SSA membership runs until ${exp}. Renew from your account to stay registered for events.</p>${siteLink('/me', 'Renew membership')}`
    : `<p>Hi ${esc(member.name)}, your SSA membership ended on ${exp}. Renew from your account to register for events again.</p>${siteLink('/me', 'Renew membership')}`;
  const sent = await sendMail({ to: member.email, subject: 'Renew your SSA membership', html });
  if (ms) await db('memberships').where({ id: ms.id }).update({ reminder_sent_at: new Date() });
  return { sent: sent > 0, email: member.email, expiry_date: exp };
}

/**
 * POST /admin/members/walk-in — a student signs up at the club's table. One transaction: the account and member profile
 * (shared createAccount, with a random password nobody knows), and with `pay_cash` the cash dues through recordCashDues
 * (payment + ledger row + active membership). After the commit, a 72-hour set-password link is emailed; if that fails
 * the sign-up still stands and `setup_link_sent` is false.
 */
export async function walkIn(admin_id: number, input: { name: string; email: string; student_id: string; phone?: string; pay_cash: boolean; amount?: number }, ip?: string) {
  const db = getDb();
  const password_hash = await bcrypt.hash(randomToken(32), 10);
  const duplicate = (field: 'email' | 'student_id') =>
    new HttpError(409, `A member with this ${field === 'email' ? 'email' : 'student ID'} already exists`, 'DUPLICATE_MEMBER', undefined, { field });
  const { user, member_id, membership } = await db.transaction(async (trx) => {
    const { user, member_id } = await createAccount(trx, { name: input.name, email: input.email, password_hash, student_id: input.student_id, phone: input.phone }, { duplicate });
    const membership = input.pay_cash ? await recordCashDues(admin_id, member_id!, input.amount ?? DEFAULT_DUES, undefined, trx) : null;
    return { user, member_id: member_id!, membership };
  });

  let setup_link_sent = false;
  try {
    const path = passwordLink(await createPasswordToken(user.id, 'setup', SETUP_TTL_MINUTES), 'setup');
    if (!env.RESEND_API_KEY) logger.info({ to: user.email, url: appUrl(path) }, 'set-password link (email not configured)');
    const accepted = await sendMail({
      to: user.email,
      subject: 'Welcome to SSA, set your password',
      html: `<p>Hi ${esc(user.name)},</p><p>Welcome to the Skyline Student Association! ${membership ? `Your membership is active until ${ymdOf(membership.expiry_date)}.` : 'Your account is ready.'}</p>`
        + `<p>Set a password to log in, see your tickets and show your membership QR at events. The link works once and expires in 72 hours.</p>`
        + siteLink(path, 'Set your password'),
    });
    setup_link_sent = !!env.RESEND_API_KEY && accepted > 0;
  } catch (err) {
    logger.error({ err, user_id: user.id }, 'walk-in: set-password link failed');
  }
  await logAuditEvent({ userId: String(admin_id), action: 'member_walk_in', entityType: 'member', entityId: String(member_id), metadata: { admin_id, pay_cash: input.pay_cash, user_id: user.id }, ipAddress: ip ?? null });

  const member = await db('members').where({ id: member_id }).first();
  return {
    user: publicUser(user), member, membership: membership ? { ...membership, expiry_date: ymdOf(membership.expiry_date) } : null,
    setup_link_sent, qr_token: membership ? signMemberQr({ uid: user.id }) : null,
  };
}
