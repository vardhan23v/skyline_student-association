import type { Knex } from 'knex';

/** Event-eve reminders: stamped when sent, so a ticket is reminded at most once. */
export async function up(k: Knex): Promise<void> {
  await k.schema.alterTable('tickets', (t) => { t.timestamp('reminder_sent_at').nullable(); });
}

export async function down(k: Knex): Promise<void> {
  await k.schema.alterTable('tickets', (t) => { t.dropColumn('reminder_sent_at'); });
}
