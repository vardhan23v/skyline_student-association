import type { Knex } from 'knex';

const isMysql = (k: Knex) => k.client.config.client === 'mysql2';

/**
 * 1. payments.provider_order_id is how the webhook finds a payment (`SELECT … FOR UPDATE`). Unindexed, InnoDB scans and
 *    locks every payments row for the length of the webhook transaction, serialising checkouts and deadlocking with order
 *    placement (variant row lock → payments insert).
 * 2. Without CLOUDINARY_URL receipts are stored as data: URLs. MySQL TEXT stops at 64 KB, so any real photo failed with
 *    "Data too long" (500). SQLite TEXT is unbounded, so only MySQL needs the change.
 */
export async function up(k: Knex): Promise<void> {
  await k.schema.alterTable('payments', (t) => { t.index(['provider_order_id'], 'payments_provider_order_id_index'); });
  if (isMysql(k)) await k.schema.alterTable('expenses', (t) => { t.text('receipt_url', 'longtext').nullable().alter(); });
}

export async function down(k: Knex): Promise<void> {
  if (isMysql(k)) await k.schema.alterTable('expenses', (t) => { t.text('receipt_url').nullable().alter(); });
  await k.schema.alterTable('payments', (t) => { t.dropIndex(['provider_order_id'], 'payments_provider_order_id_index'); });
}
