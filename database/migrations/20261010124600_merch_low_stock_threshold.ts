import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('products', 'low_stock_threshold');
  if (!hasColumn) {
    await knex.schema.alterTable('products', (table) => {
      table.integer('low_stock_threshold').defaultTo(5);
      table.boolean('is_featured').defaultTo(false).index();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('products', 'low_stock_threshold');
  if (hasColumn) {
    await knex.schema.alterTable('products', (table) => {
      table.dropColumn('low_stock_threshold');
      table.dropColumn('is_featured');
    });
  }
}
