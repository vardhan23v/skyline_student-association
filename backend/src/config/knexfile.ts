import 'dotenv/config';
import type { Knex } from 'knex';
import path from 'node:path';

const migrations = { directory: path.resolve(__dirname, '../../../database/migrations'), extension: 'ts' };
const seeds = { directory: path.resolve(__dirname, '../../../database/seeds'), extension: 'ts' };

export function buildConfig(databaseUrl = process.env.DATABASE_URL): Knex.Config {
  if (databaseUrl) {
    // Match what SQLite returns so code behaves the same in dev and prod: DATE columns as 'YYYY-MM-DD' strings
    // (not Date objects that stringify as "Wed Jun 30 2027 …"), DECIMAL as numbers (not '500.00'), timestamps in UTC.
    // `database` is repeated because knex reads it from the settings (columnInfo/hasColumn), not from the URI.
    const connection: Knex.MySql2ConnectionConfig = {
      uri: databaseUrl,
      database: decodeURIComponent(new URL(databaseUrl).pathname.slice(1)),
      dateStrings: ['DATE'] as unknown as boolean, // mysql2 accepts a list of types; knex's typings only say boolean
      decimalNumbers: true,
      timezone: 'Z',
    };
    // min 0: idle pooled connections get closed by MySQL's wait_timeout overnight.
    return { client: 'mysql2', connection, pool: { min: 0, max: 10 }, migrations, seeds };
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

