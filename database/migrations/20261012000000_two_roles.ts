import type { Knex } from 'knex';

const isMysql = (k: Knex) => k.client.config.client === 'mysql2';
const HELD = ['checked_in', 'confirmed', 'pending']; // best first: the row a user keeps when they hold several

/**
 * SQLite changes a column's CHECK by rebuilding the table, which is impossible while `users` is referenced and
 * foreign keys are on, and the pragma is a no-op inside a transaction. So this migration manages its own: on SQLite
 * (dev and tests) it switches foreign keys off around the rebuild; MySQL DDL commits implicitly anyway.
 */
export const config = { transaction: false };
const withoutFks = async (k: Knex, fn: () => Promise<void>) => {
  if (isMysql(k)) return fn();
  await k.raw('PRAGMA foreign_keys = OFF');
  try { await fn(); } finally { await k.raw('PRAGMA foreign_keys = ON'); }
};

/** Set the allowed `users.role` values: MODIFY on MySQL; on SQLite rebuild the table with a new CHECK (knex keeps the old one). */
async function setRoleEnum(k: Knex, values: string[], def: string) {
  const list = values.map((v) => `'${v}'`).join(',');
  if (isMysql(k)) return void (await k.raw(`ALTER TABLE users MODIFY role ENUM(${list}) NOT NULL DEFAULT '${def}'`));
  const [{ sql }] = await k.raw("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'");
  const col = /`role` text check \(`role` in \([^)]*\)\) not null default '\w+'/;
  if (!col.test(sql)) throw new Error('two_roles: unexpected users DDL on SQLite');
  const indexes: { sql: string }[] = await k.raw("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'users' AND sql IS NOT NULL");
  await k.raw(sql.replace(col, `\`role\` text check (\`role\` in (${list})) not null default '${def}'`).replace(/^CREATE TABLE [`"]?users[`"]?/, 'CREATE TABLE `users__new`'));
  await k.raw('INSERT INTO `users__new` SELECT * FROM `users`');
  await k.raw('DROP TABLE `users`');
  await k.raw('ALTER TABLE `users__new` RENAME TO `users`');
  for (const i of indexes) await k.raw(i.sql);
}

/**
 * Two roles (Phase 1): `admin` runs the club, `user` is any registered student. Membership is a status (an active
 * `memberships` row), not a role. Old roles map admin, treasurer → admin and volunteer, member → user.
 *
 * Also: one ticket per user per event, UNIQUE(event_id, holder_user_id). Re-registering after a cancel reuses the row.
 * Duplicates from the old purchase flow are not deleted: the extra rows are detached from the account (holder_user_id
 * NULL) and keep their holder name, email and QR, so they still scan at the door.
 */
export async function up(k: Knex): Promise<void> {
  await withoutFks(k, () => upRoles(k));
  await dedupeAndUnique(k);
}

async function upRoles(k: Knex) {
  await setRoleEnum(k, ['member', 'volunteer', 'admin', 'treasurer', 'user'], 'user');
  await k('users').whereIn('role', ['admin', 'treasurer']).update({ role: 'admin' });
  await k('users').whereIn('role', ['volunteer', 'member']).update({ role: 'user' });
  await setRoleEnum(k, ['admin', 'user'], 'user');
}

async function dedupeAndUnique(k: Knex) {
  const dups = await k('tickets').whereNotNull('holder_user_id').select('event_id', 'holder_user_id').count({ n: '*' })
    .groupBy('event_id', 'holder_user_id').havingRaw('COUNT(*) > 1');
  for (const d of dups) {
    const rows = await k('tickets').where({ event_id: d.event_id, holder_user_id: d.holder_user_id }).orderBy('id', 'desc');
    const rank = (s: string) => { const i = HELD.indexOf(s); return i < 0 ? HELD.length : i; };
    const keep = [...rows].sort((a, b) => rank(a.status) - rank(b.status))[0];
    await k('tickets').whereIn('id', rows.filter((r) => r.id !== keep.id).map((r) => r.id)).update({ holder_user_id: null });
  }
  await k.schema.alterTable('tickets', (t) => { t.unique(['event_id', 'holder_user_id'], { indexName: 'tickets_event_holder_unique' }); });
}

export async function down(k: Knex): Promise<void> {
  await k.schema.alterTable('tickets', (t) => { t.dropUnique(['event_id', 'holder_user_id'], 'tickets_event_holder_unique'); });
  await withoutFks(k, () => downRoles(k));
}

async function downRoles(k: Knex) {
  await setRoleEnum(k, ['member', 'volunteer', 'admin', 'treasurer', 'user'], 'member');
  await k('users').where({ role: 'user' }).update({ role: 'member' });
  await setRoleEnum(k, ['member', 'volunteer', 'admin', 'treasurer'], 'member');
}
