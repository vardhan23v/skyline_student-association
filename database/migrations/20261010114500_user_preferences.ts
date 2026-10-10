import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('user_preferences');
  if (!exists) {
    await knex.schema.createTable('user_preferences', (table) => {
      table.string('id').primary();
      table.string('user_id').notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
      table.boolean('email_announcements').defaultTo(true);
      table.boolean('event_reminders').defaultTo(true);
      table.boolean('renewal_alerts').defaultTo(true);
      table.string('theme_preference', 30).defaultTo('midnight');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_preferences');
}
