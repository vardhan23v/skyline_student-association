import 'dotenv/config';
import type { Knex } from 'knex';
import path from 'node:path';

const migrations = { directory: path.resolve(__dirname, '../../../database/migrations'), extension: 'ts' };
const seeds = { directory: path.resolve(__dirname, '../../../database/seeds'), extension: 'ts' };

export function buildConfig(databaseUrl = process.env.DATABASE_URL): Knex.Config {
  if (databaseUrl) {
    return { client: 'mysql2', connection: databaseUrl, pool: { min: 1, max: 10 }, migrations, seeds };
  }
  const filename = process.env.SQLITE_FILE ?? path.resolve(__dirname, '../../dev.sqlite');
  return {
    client: 'better-sqlite3',
    connection: { filename },
    useNullAsDefault: true,
    pool: { afterCreate: (conn: any, done: any) => { conn.pragma('foreign_keys = ON'); done(null, conn); } },
    migrations,
    seeds,
  };
}

