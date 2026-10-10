import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('events', 'tags');
  if (!hasColumn) {
    await knex.schema.alterTable('events', (table) => {
      table.string('tags', 500).defaultTo('[]');
      table.string('category', 100).defaultTo('general').index();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('events', 'tags');
  if (hasColumn) {
    await knex.schema.alterTable('events', (table) => {
      table.dropColumn('tags');
      table.dropColumn('category');
    });
  }
}
