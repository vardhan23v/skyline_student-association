import { createApp } from './app';
import { env } from './config/env';
import { getDb } from './config/db';
import { logger } from './lib/logger';
import { startJobs } from './jobs';

// Log stray promise rejections instead of letting Node 22 kill the process (and every in-flight request and cron job).
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled promise rejection'));

async function main() {
  await getDb().raw('select 1');
  const app = createApp();
  app.listen(env.PORT, () => logger.info({ port: env.PORT, env: env.NODE_ENV }, 'SSA API listening'));
  startJobs();
}
main().catch((err) => { logger.error({ err }, 'failed to start'); process.exit(1); });
