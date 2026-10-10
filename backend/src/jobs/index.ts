import cron from 'node-cron';
import { getDb } from '../config/db';
import { logger } from '../lib/logger';
import { sendMail, siteLink } from '../lib/email';
import { expirePendingTickets } from '../modules/events/service';
import { expirePendingOrders } from '../modules/merchandise/service';
import { rescanSubmitted } from '../modules/finance/anomaly';
import { env } from '../config/env';
import { addDaysYmd, todayYmd } from '../lib/dates';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** §6.4 — renewal reminders at T-14d and on expiry day. */
export async function sendRenewalReminders() {
  const db = getDb();
  // The club's calendar day: at 08:00 IST the UTC date is the same, but jobs must not depend on when they happen to run.
  const today = todayYmd();
  const rows = await db('memberships as ms').join('members as m', 'm.id', 'ms.member_id').join('users as u', 'u.id', 'm.user_id')
    .where('ms.status', 'active').whereBetween('ms.expiry_date', [today, addDaysYmd(today, 14)]).whereNull('ms.reminder_sent_at')
    .select('ms.id', 'u.email', 'u.name', 'ms.expiry_date');
  for (const r of rows) {
    await sendMail({ to: r.email, subject: 'Your SSA membership expires soon', html: `<p>Hi ${esc(r.name)}, your membership expires on ${r.expiry_date}. Renew from your account.</p>${siteLink('/me', 'Renew membership')}` });
    await db('memberships').where({ id: r.id }).update({ reminder_sent_at: new Date() });
  }
  const dueToday = await db('memberships as ms').join('members as m', 'm.id', 'ms.member_id').join('users as u', 'u.id', 'm.user_id')
    .where('ms.status', 'active').where('ms.expiry_date', today)
    .whereNotIn('ms.id', rows.map((r) => r.id)) // just got the "expires soon" email above: don't send two in one run
    .select('u.email', 'u.name');
  for (const r of dueToday) await sendMail({ to: r.email, subject: 'Your SSA membership expires today', html: `<p>Hi ${esc(r.name)}, today is the last day of your membership.</p>${siteLink('/me', 'Renew membership')}` });
  return rows.length;
}

export async function expireMemberships() {
  // Runs at 00:05 IST, when the UTC date is still yesterday: with a UTC "today" memberships expired a day late.
  return getDb()('memberships').where({ status: 'active' }).where('expiry_date', '<', todayYmd()).update({ status: 'expired' });
}

export async function lowStockAlert() {
  const db = getDb();
  // `stock < reserved + 5`, not `stock - reserved < 5`: UNSIGNED subtraction errors in MySQL once reserved > stock.
  const low = await db('product_variants as v').join('products as p', 'p.id', 'v.product_id').whereRaw('v.stock < v.reserved + 5').select('p.name', 'v.size', 'v.stock', 'v.reserved');
  if (!low.length) return 0;
  const admins = await db('users').where({ role: 'admin', is_active: true }).pluck('email');
  await sendMail({ to: admins, subject: 'Low stock alert', html: '<ul>' + low.map((l) => `<li>${l.name} ${l.size}: ${l.stock - l.reserved} left</li>`).join('') + '</ul>' + siteLink('/admin?tab=products', 'Open products & stock') });
  return low.length;
}

export async function expireHolds() {
  const t = await expirePendingTickets(); const o = await expirePendingOrders();
  if (t || o) logger.info({ tickets: t, orders: o }, 'expired pending holds');
}

/** Single API instance → in-process cron is fine (§11). Keep replicas = 1. */
export function startJobs() {
  const wrap = (name: string, fn: () => Promise<unknown>) => () => fn().catch((err) => logger.error({ err, job: name }, 'job failed'));
  cron.schedule('*/5 * * * *', wrap('expireHolds', expireHolds));
  const timezone = env.APP_TIMEZONE;
  cron.schedule('0 8 * * *', wrap('renewalReminders', sendRenewalReminders), { timezone });
  cron.schedule('5 0 * * *', wrap('expireMemberships', expireMemberships), { timezone });
  cron.schedule('30 1 * * *', wrap('anomalyScan', () => rescanSubmitted(getDb())), { timezone });
  cron.schedule('0 2 * * *', wrap('lowStock', lowStockAlert), { timezone });
  logger.info('scheduled jobs started');
}
