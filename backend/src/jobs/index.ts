import cron from 'node-cron';
import { getDb } from '../config/db';
import { logger } from '../lib/logger';
import { sendMail } from '../lib/email';
import { expirePendingTickets } from '../modules/events/service';
import { expirePendingOrders } from '../modules/merchandise/service';
import { rescanSubmitted } from '../modules/finance/anomaly';

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** §6.4 — renewal reminders at T-14d and on expiry day. */
export async function sendRenewalReminders() {
  const db = getDb();
  const today = ymd(new Date()); const in14 = new Date(); in14.setDate(in14.getDate() + 14);
  const rows = await db('memberships as ms').join('members as m', 'm.id', 'ms.member_id').join('users as u', 'u.id', 'm.user_id')
    .where('ms.status', 'active').whereBetween('ms.expiry_date', [today, ymd(in14)]).whereNull('ms.reminder_sent_at')
    .select('ms.id', 'u.email', 'u.name', 'ms.expiry_date');
  for (const r of rows) {
    await sendMail({ to: r.email, subject: 'Your SSA membership expires soon', html: `<p>Hi ${r.name}, your membership expires on ${r.expiry_date}. Renew from your member portal.</p>` });
    await db('memberships').where({ id: r.id }).update({ reminder_sent_at: new Date() });
  }
  const dueToday = await db('memberships as ms').join('members as m', 'm.id', 'ms.member_id').join('users as u', 'u.id', 'm.user_id')
    .where('ms.status', 'active').where('ms.expiry_date', today).select('u.email', 'u.name');
  for (const r of dueToday) await sendMail({ to: r.email, subject: 'Your SSA membership expires today', html: `<p>Hi ${r.name}, today is the last day of your membership.</p>` });
  return rows.length;
}

export async function expireMemberships() {
  return getDb()('memberships').where({ status: 'active' }).where('expiry_date', '<', ymd(new Date())).update({ status: 'expired' });
}

export async function lowStockAlert() {
  const db = getDb();
  const low = await db('product_variants as v').join('products as p', 'p.id', 'v.product_id').whereRaw('v.stock - v.reserved < 5').select('p.name', 'v.size', 'v.stock', 'v.reserved');
  if (!low.length) return 0;
  const admins = await db('users').where({ role: 'admin', is_active: true }).pluck('email');
  await sendMail({ to: admins, subject: 'Low stock alert', html: '<ul>' + low.map((l) => `<li>${l.name} ${l.size}: ${l.stock - l.reserved} left</li>`).join('') + '</ul>' });
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
  cron.schedule('0 8 * * *', wrap('renewalReminders', sendRenewalReminders), { timezone: 'Asia/Kolkata' });
  cron.schedule('5 0 * * *', wrap('expireMemberships', expireMemberships), { timezone: 'Asia/Kolkata' });
  cron.schedule('30 1 * * *', wrap('anomalyScan', () => rescanSubmitted(getDb())), { timezone: 'Asia/Kolkata' });
  cron.schedule('0 2 * * *', wrap('lowStock', lowStockAlert), { timezone: 'Asia/Kolkata' });
  logger.info('scheduled jobs started');
}
