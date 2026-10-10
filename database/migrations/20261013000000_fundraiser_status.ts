import type { Knex } from 'knex';

const isMysql = (k: Knex) => k.client.config.client === 'mysql2';
const OLD = ['planning', 'active', 'closed'];
const NEW = ['planned', 'active', 'completed', 'cancelled'];
const RENAME: [string, string][] = [['planning', 'planned'], ['closed', 'completed']];
const INDEXES: { name: string; columns: string[] }[] = [
  { name: 'tasks_fundraiser_status_index', columns: ['fundraiser_id', 'status'] },
  { name: 'tasks_assignee_index', columns: ['assignee_id'] },
];

/** Same reason as two_roles: the SQLite rebuild needs foreign keys off, and the pragma is a no-op inside a transaction. */
export const config = { transaction: false };
const withoutFks = async (k: Knex, fn: () => Promise<void>) => {
  if (isMysql(k)) return fn();
  await k.raw('PRAGMA foreign_keys = OFF');
  try { await fn(); } finally { await k.raw('PRAGMA foreign_keys = ON'); }
};

/** Set the allowed `fundraisers.status` values: MODIFY on MySQL; on SQLite rebuild the table with a new CHECK. */
async function setStatusEnum(k: Knex, values: string[], def: string) {
  const list = values.map((v) => `'${v}'`).join(',');
  if (isMysql(k)) return void (await k.raw(`ALTER TABLE fundraisers MODIFY status ENUM(${list}) NOT NULL DEFAULT '${def}'`));
  const [{ sql }] = await k.raw("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'fundraisers'");
  const col = /`status` text check \(`status` in \([^)]*\)\) not null default '\w+'/;
  if (!col.test(sql)) throw new Error('fundraiser_status: unexpected fundraisers DDL on SQLite');
  const indexes: { sql: string }[] = await k.raw("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'fundraisers' AND sql IS NOT NULL");
  await k.raw(sql.replace(col, `\`status\` text check (\`status\` in (${list})) not null default '${def}'`).replace(/^CREATE TABLE [`"]?fundraisers[`"]?/, 'CREATE TABLE `fundraisers__new`'));
  await k.raw('INSERT INTO `fundraisers__new` SELECT * FROM `fundraisers`');
  await k.raw('DROP TABLE `fundraisers`');
  await k.raw('ALTER TABLE `fundraisers__new` RENAME TO `fundraisers`');
  for (const i of indexes) await k.raw(i.sql);
}

/** Each index on `tasks` as its name and ordered columns (MySQL also indexes every foreign key column on its own). */
async function taskIndexes(k: Knex): Promise<{ name: string; columns: string[] }[]> {
  if (isMysql(k)) {
    const [rows] = await k.raw('SHOW INDEX FROM tasks');
    const by = new Map<string, string[]>();
    for (const r of rows as any[]) by.set(r.Key_name, [...(by.get(r.Key_name) ?? []), r.Column_name]);
    return [...by].map(([name, columns]) => ({ name, columns }));
  }
  const list: { name: string }[] = await k.raw('PRAGMA index_list(`tasks`)');
  return Promise.all(list.map(async (i) => ({ name: i.name, columns: ((await k.raw(`PRAGMA index_info(\`${i.name}\`)`)) as { name: string }[]).map((c) => c.name) })));
}

/**
 * Fundraiser lifecycle (Phase 2.5): planning | active | closed → planned | active | completed | cancelled, with
 * planning → planned and closed → completed. Also indexes the task board's lookups (by fundraiser and status, and by
 * assignee), skipping any that an existing index already starts with.
 */
export async function up(k: Knex): Promise<void> {
  await withoutFks(k, async () => {
    await setStatusEnum(k, [...new Set([...OLD, ...NEW])], 'planning');
    for (const [from, to] of RENAME) await k('fundraisers').where({ status: from }).update({ status: to });
    await setStatusEnum(k, NEW, 'planned');
  });
  const existing = await taskIndexes(k);
  for (const ix of INDEXES) {
    if (existing.some((e) => ix.columns.every((c, n) => e.columns[n] === c))) continue;
    await k.schema.alterTable('tasks', (t) => { t.index(ix.columns, ix.name); });
  }
}

export async function down(k: Knex): Promise<void> {
  const existing = await taskIndexes(k);
  for (const ix of INDEXES) if (existing.some((e) => e.name === ix.name)) await k.schema.alterTable('tasks', (t) => { t.dropIndex(ix.columns, ix.name); });
  await withoutFks(k, async () => {
    await setStatusEnum(k, [...new Set([...OLD, ...NEW])], 'planned');
    for (const [from, to] of RENAME) await k('fundraisers').where({ status: to }).update({ status: from });
    // There was no cancelled state before: a cancelled fundraiser is closed.
    await k('fundraisers').where({ status: 'cancelled' }).update({ status: 'closed' });
    await setStatusEnum(k, OLD, 'planning');
  });
}
