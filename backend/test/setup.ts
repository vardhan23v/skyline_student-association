import knex from 'knex';
import { buildConfig } from '../src/config/knexfile';
import { setDb, getDb } from '../src/config/db';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';

export async function freshDb() {
  const db = knex({ ...buildConfig(''), connection: { filename: ':memory:' } });
  setDb(db);
  await db.migrate.latest();
  return db;
}
export { getDb };
