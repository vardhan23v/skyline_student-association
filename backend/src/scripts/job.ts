/** `npm run job <name>` — run one scheduled job now, e.g. `npm run job eventReminders` (same code as the cron). */
import { getDb } from '../config/db';
import { logger } from '../lib/logger';
import { expireHolds, expireMemberships, lowStockAlert, sendRenewalReminders } from '../jobs';
import { sendEventReminders } from '../modules/events/service';

const jobs: Record<string, () => Promise<unknown>> = {
  eventReminders: () => sendEventReminders(), renewalReminders: sendRenewalReminders, expireMemberships, expireHolds, lowStock: lowStockAlert,
};

async function main() {
  const name = process.argv[2] ?? '';
  const job = jobs[name];
  if (!job) throw new Error(`unknown job "${name}"; one of: ${Object.keys(jobs).join(', ')}`);
  logger.info({ job: name, result: await job() }, 'job finished');
  await getDb().destroy();
}
main().catch((e) => { console.error(e); process.exit(1); });
