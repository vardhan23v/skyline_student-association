import knex, { Knex } from 'knex';
import { buildConfig } from './knexfile';

let instance: Knex | null = null;

export function getDb(): Knex {
  if (!instance) instance = knex(buildConfig());
  return instance;
}

/** Replace the shared instance (tests use an in-memory SQLite db). */
export function setDb(db: Knex) {
  instance = db;
}

export const isMysql = () => getDb().client.config.client === 'mysql2';

/** `SELECT … FOR UPDATE` on MySQL; SQLite serialises writes anyway. */
export function lockRow<T extends {}>(qb: Knex.QueryBuilder<T>) {
  return isMysql() ? qb.forUpdate() : qb;
}

export const now = () => new Date();
