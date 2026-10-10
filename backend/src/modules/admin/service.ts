import type { Knex } from 'knex';
import { getDb } from '../../config/db';
import { startOfDayInTz, todayYmd } from '../../lib/dates';
import { summary } from '../finance/service';
import { fundraiserProgress } from '../fundraisers/routes';

const round2 = (n: number) => Math.round(n * 100) / 100;
/** created_at is DATETIME on MySQL but 'YYYY-MM-DD HH:MM:SS' (UTC) text on SQLite, where a JS Date binds as epoch ms. */
const createdAtBound = (db: Knex, d: Date) => (db.client.config.client === 'mysql2' ? d : d.toISOString().replace('T', ' ').slice(0, 19));

/** GET /admin/overview — the dashboard's headline numbers. "Today" is the club's calendar day (APP_TIMEZONE). */
export async function overview() {
  const db = getDb();
  const today = todayYmd();
  const since = createdAtBound(db, startOfDayInTz(today));
  const [[{ total }], [{ active }], [{ upcoming }], todays, [{ pending }], fin, fundraisers] = await Promise.all([
    db('members').count({ total: '*' }),
    db('memberships').where({ status: 'active' }).where('expiry_date', '>=', today).countDistinct({ active: 'member_id' }),
    db('tickets as t').join('events as e', 'e.id', 't.event_id').where('e.starts_at', '>', new Date()).whereNot('e.status', 'draft')
      .whereIn('t.status', ['confirmed', 'checked_in']).count({ upcoming: '*' }),
    db('orders').where('created_at', '>=', since).select('status', 'total'),
    db('orders').where({ status: 'pending' }).count({ pending: '*' }),
    summary({}),
    fundraiserProgress(undefined, { status: 'active' }),
  ]);
  const sold = todays.filter((o: any) => o.status === 'paid' || o.status === 'fulfilled');
  return {
    members: { active: Number(active), total: Number(total) },
    upcoming_registrations: Number(upcoming),
    orders_today: { count: todays.length, paid: sold.length, revenue: round2(sold.reduce((s: number, o: any) => s + Number(o.total), 0)) },
    pending_orders: Number(pending),
    balance: fin.balance,
    fundraisers: { active: fundraisers.length, behind: fundraisers.filter((f: { health: string }) => f.health === 'behind').length },
    as_of: today,
  };
}

/**
 * GET /api/stats — public headline numbers for the landing page, all counted from the database (no money: finance is
 * admin-only). Events hosted = non-draft events that have started; members = active memberships covering today.
 */
export async function publicStats() {
  const db = getDb();
  const today = todayYmd();
  const now = new Date();
  const [[{ hosted }], [{ upcoming }], [{ members }], [{ students }], [{ tickets }]] = await Promise.all([
    db('events').whereNot('status', 'draft').where('starts_at', '<=', now).count({ hosted: '*' }),
    db('events').where('status', 'published').where('starts_at', '>', now).count({ upcoming: '*' }),
    db('memberships').where({ status: 'active' }).where('start_date', '<=', today).where('expiry_date', '>=', today).countDistinct({ members: 'member_id' }),
    db('users').where({ role: 'user', is_active: true }).count({ students: '*' }),
    db('tickets').whereIn('status', ['confirmed', 'checked_in']).count({ tickets: '*' }),
  ]);
  return { events_hosted: Number(hosted), upcoming_events: Number(upcoming), members: Number(members), students: Number(students), tickets_issued: Number(tickets), as_of: today };
}
