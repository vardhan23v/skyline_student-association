import type { Knex } from 'knex';
import { getDb } from '../../config/db';
import { env } from '../../config/env';
import { badRequest, notFound } from '../../lib/errors';
import { signMemberQr, verifyQr } from '../../lib/qr';
import { recordEntry } from '../finance/service';
import { createCashPayment, createPendingPayment } from '../payments/service';
import { DEFAULT_DUES } from './schemas';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const today = () => ymd(new Date());

/** Academic year end: next occurrence of MEMBERSHIP_YEAR_END (MM-DD). */
export function academicYearEnd(from = new Date()): string {
  const [mm, dd] = env.MEMBERSHIP_YEAR_END.split('-').map(Number);
  let end = new Date(Date.UTC(from.getUTCFullYear(), mm - 1, dd));
  if (end <= from) end = new Date(Date.UTC(from.getUTCFullYear() + 1, mm - 1, dd));
  return ymd(end);
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

/** POST /memberships — start online dues payment. */
export async function startDues(user_id: number, amount = DEFAULT_DUES) {
  const db = getDb();
  const member = await memberForUser(db, user_id);
  if (!member) throw badRequest('Complete your member profile (student ID) first');
  if (await currentMembership(db, member.id)) throw badRequest('Membership already active');
  return db.transaction(async (trx) => {
    const start = today();
    const [membership_id] = await trx('memberships').insert({ member_id: member.id, start_date: start, expiry_date: academicYearEnd(), status: 'pending' });
    const { payment_id, checkout } = await createPendingPayment(trx, { user_id, amount, purpose: 'dues', reference_type: 'membership', reference_id: membership_id as number });
    await trx('memberships').where({ id: membership_id }).update({ payment_id });
    return { membership_id, checkout };
  });
}

/** Called from the payment webhook (or cash entry) — the only places a membership becomes active. */
export async function activateMembership(trx: Knex.Transaction, membership_id: number, payment_id: number) {
  const m = await trx('memberships').where({ id: membership_id }).first();
  if (!m) throw notFound('Membership not found');
  if (m.status === 'active') return m;
  await trx('memberships').where({ id: membership_id }).update({ status: 'active', payment_id, start_date: today() });
  const payment = await trx('payments').where({ id: payment_id }).first();
  const member = await trx('members').where({ id: m.member_id }).first();
  await recordEntry(trx, { direction: 'in', amount: Number(payment.amount), category: 'dues', source_type: 'payment', source_id: payment_id, memo: `Dues ${member?.student_id ?? ''}`, entered_by: payment.user_id });
  return trx('memberships').where({ id: membership_id }).first();
}

/** Treasurer records cash dues at the sign-up table. */
export async function recordCashDues(treasurer_id: number, member_id: number, amount: number, expiry_date?: string) {
  const db = getDb();
  const member = await db('members').where({ id: member_id }).first();
  if (!member) throw notFound('Member not found');
  if (await currentMembership(db, member_id)) throw badRequest('Membership already active');
  return db.transaction(async (trx) => {
    const [membership_id] = await trx('memberships').insert({ member_id, start_date: today(), expiry_date: expiry_date ?? academicYearEnd(), status: 'pending' });
    const payment_id = await createCashPayment(trx, { user_id: member.user_id, amount, purpose: 'dues', reference_type: 'membership', reference_id: membership_id as number });
    await trx('payments').where({ id: payment_id }).update({ user_id: treasurer_id });
    const row = await activateMembership(trx, membership_id as number, payment_id);
    return row;
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
        const until = new Date(); until.setDate(until.getDate() + q.expiring_within_days);
        qb.where('ms.status', 'active').whereBetween('ms.expiry_date', [today(), ymd(until)]);
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
    member = /^\d+$/.test(idOrStudent) ? await db('members').where({ id: Number(idOrStudent) }).first() : null;
    if (!member) member = await db('members').where({ student_id: idOrStudent }).first();
  }
  if (!member) return { valid: false, reason: 'Member not found' };
  const user = await db('users').where({ id: member.user_id }).first();
  const ms = await currentMembership(db, member.id);
  return { valid: !!ms, reason: ms ? undefined : 'No active membership', member: { id: member.id, student_id: member.student_id, name: user.name }, expiry_date: ms?.expiry_date };
}

export async function myMembership(user_id: number) {
  const db = getDb();
  const member = await memberForUser(db, user_id);
  if (!member) return { member: null, membership: null, qr_token: null };
  const ms = await currentMembership(db, member.id);
  const latest = await db('memberships').where({ member_id: member.id }).orderBy('id', 'desc').first();
  return { member, membership: ms ?? latest ?? null, active: !!ms, qr_token: ms ? signMemberQr({ uid: user_id }) : null };
}
