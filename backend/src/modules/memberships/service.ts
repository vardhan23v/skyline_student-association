import type { Knex } from 'knex';
import { getDb, lockRow } from '../../config/db';
import { env } from '../../config/env';
import { badRequest, notFound } from '../../lib/errors';
import { signMemberQr, verifyQr } from '../../lib/qr';
import { addDaysYmd, todayYmd, ymdInTz, ymdOf } from '../../lib/dates';
import { recordEntry } from '../finance/service';
import { createCashPayment, createPendingPayment } from '../payments/service';
import { DEFAULT_DUES } from './schemas';

/** Today in the club's time zone (APP_TIMEZONE) — the UTC date lags IST until 05:30. */
const today = todayYmd;

/** Academic year end: next occurrence of MEMBERSHIP_YEAR_END (MM-DD) after `from`'s calendar day in the club's time zone. */
export function academicYearEnd(from = new Date()): string {
  const day = ymdInTz(from);
  const year = Number(day.slice(0, 4));
  const end = `${year}-${env.MEMBERSHIP_YEAR_END}`;
  return end > day ? end : `${year + 1}-${env.MEMBERSHIP_YEAR_END}`;
}

export async function currentMembership(db: Knex, member_id: number) {
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
export async function startDues(user_id: number) {
  const db = getDb();
  return db.transaction(async (trx) => {
    // Lock the member row so two clicks / tabs can't both pass the checks below.
    const member = await lockRow(trx('members').where({ user_id })).first();
    if (!member) throw badRequest('Complete your member profile (student ID) first');
    if (await currentMembership(trx, member.id)) throw badRequest('Membership already active');
    const start = today(), expiry_date = academicYearEnd();
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
    return { membership_id, checkout };
  });
}

/**
 * Called from the payment webhook (or cash entry) — the only places a membership becomes active.
 * `entered_by` defaults to the payer; cash entry passes the treasurer who took the money.
 */
export async function activateMembership(trx: Knex.Transaction, membership_id: number, payment_id: number, entered_by?: number) {
  const m = await trx('memberships').where({ id: membership_id }).first();
  if (!m) throw notFound('Membership not found');
  if (m.status === 'active') return m;
  // A checkout opened before the academic year ended but paid after it would otherwise activate an already-expired membership.
  const expiry_date = ymdOf(m.expiry_date) < today() ? academicYearEnd() : ymdOf(m.expiry_date);
  await trx('memberships').where({ id: membership_id }).update({ status: 'active', payment_id, start_date: today(), expiry_date });
  const payment = await trx('payments').where({ id: payment_id }).first();
  const member = await trx('members').where({ id: m.member_id }).first();
  await recordEntry(trx, { direction: 'in', amount: Number(payment.amount), category: 'dues', source_type: 'payment', source_id: payment_id, memo: `Dues ${member?.student_id ?? ''}`, entered_by: entered_by ?? payment.user_id });
  return trx('memberships').where({ id: membership_id }).first();
}

/** Treasurer records cash dues at the sign-up table. */
export async function recordCashDues(treasurer_id: number, member_id: number, amount: number, expiry_date?: string) {
  if (expiry_date && expiry_date < today()) throw badRequest('expiry_date is in the past');
  const db = getDb();
  return db.transaction(async (trx) => {
    // Checks run under the member row lock so a double submit can't record the dues (and the ledger row) twice.
    const member = await lockRow(trx('members').where({ id: member_id })).first();
    if (!member) throw notFound('Member not found');
    if (await currentMembership(trx, member_id)) throw badRequest('Membership already active');
    const [membership_id] = await trx('memberships').insert({ member_id, start_date: today(), expiry_date: expiry_date ?? academicYearEnd(), status: 'pending' });
    // payments.user_id is the payer (the member); the treasurer is recorded as the ledger's entered_by.
    const payment_id = await createCashPayment(trx, { user_id: member.user_id, amount, purpose: 'dues', reference_type: 'membership', reference_id: membership_id as number });
    return activateMembership(trx, membership_id as number, payment_id, treasurer_id);
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
    .select('m.id', 'm.student_id', 'm.phone', 'm.joined_at', 'u.name', 'u.email', 'u.role', 'ms.status as membership_status', 'ms.expiry_date', 'ms.start_date')
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
  if (!member) return { member: null, membership: null, active: false, qr_token: null };
  const ms = await currentMembership(db, member.id);
  const latest = await db('memberships').where({ member_id: member.id }).orderBy('id', 'desc').first();
  return { member, membership: ms ?? latest ?? null, active: !!ms, qr_token: ms ? signMemberQr({ uid: user_id }) : null };
}
