import { createApp } from './app';
import { env } from './config/env';
import { getDb } from './config/db';
import { logger } from './lib/logger';
import { startJobs } from './jobs';

async function main() {
  await getDb().raw('select 1');
  const app = createApp();
  app.listen(env.PORT, () => logger.info({ port: env.PORT, env: env.NODE_ENV }, 'SSA API listening'));
  startJobs();
}
main().catch((err) => { logger.error({ err }, 'failed to start'); process.exit(1); });
