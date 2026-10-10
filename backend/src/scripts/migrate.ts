/** `tsx src/scripts/migrate.ts [latest|rollback|seed]` — used by `npm run migrate` / `npm run seed` and the Railway start command. */
import { getDb } from '../config/db';
import { logger } from '../lib/logger';

async function main() {
  const cmd = process.argv[2] ?? 'latest';
  const db = getDb();
  if (cmd === 'latest') { const [batch, files] = await db.migrate.latest(); logger.info({ batch, files }, 'migrations applied'); }
  else if (cmd === 'rollback') { const [batch, files] = await db.migrate.rollback(); logger.info({ batch, files }, 'rolled back'); }
  else if (cmd === 'seed') { const [files] = await db.seed.run(); logger.info({ files }, 'seeds run'); }
  else throw new Error(`unknown command ${cmd}`);
  await db.destroy();
}
main().catch((e) => { console.error(e); process.exit(1); });
