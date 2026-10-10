import { getDb } from '../config/db';
import fs from 'fs';
import path from 'path';

export async function backupDatabaseTables(): Promise<void> {
  const db = getDb();
  const tables = ['users', 'events', 'event_registrations', 'products', 'orders', 'expenses', 'audit_logs', 'user_preferences'];
  const dump: Record<string, unknown[]> = {};

  for (const table of tables) {
    try {
      const exists = await db.schema.hasTable(table);
      if (exists) {
        dump[table] = await db(table).select('*');
      }
    } catch (err) {
      console.warn(`Could not export table ${table}:`, err);
    }
  }

  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const filename = `db_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const filePath = path.join(backupDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(dump, null, 2), 'utf-8');
  console.log(`[DB_BACKUP] Successfully exported database to ${filePath}`);
}
