import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('audit_logs');
  if (!exists) {
    await knex.schema.createTable('audit_logs', (table) => {
      table.string('id').primary();
      table.string('user_id').nullable().index();
      table.string('action', 100).notNullable().index();
      table.string('entity_type', 100).notNullable().index();
      table.string('entity_id', 255).nullable();
      table.text('metadata').nullable();
      table.string('ip_address', 45).nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now()).index();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
}
