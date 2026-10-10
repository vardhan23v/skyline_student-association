import type { Knex } from 'knex';

/** "Who owes what" reminders: at most one per membership / order per 24 hours. */
export async function up(k: Knex): Promise<void> {
  await k.schema.alterTable('memberships', (t) => { t.timestamp('last_reminded_at').nullable(); });
  await k.schema.alterTable('orders', (t) => { t.timestamp('last_reminded_at').nullable(); });
}

export async function down(k: Knex): Promise<void> {
  await k.schema.alterTable('orders', (t) => { t.dropColumn('last_reminded_at'); });
  await k.schema.alterTable('memberships', (t) => { t.dropColumn('last_reminded_at'); });
}
