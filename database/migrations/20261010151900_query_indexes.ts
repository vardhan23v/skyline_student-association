import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  try {
    const hasRegs = await knex.schema.hasTable('event_registrations');
    if (hasRegs) {
      await knex.schema.alterTable('event_registrations', (table) => {
        table.index(['event_id', 'status'], 'idx_reg_event_status');
      });
    }

    const hasOrders = await knex.schema.hasTable('orders');
    if (hasOrders) {
      await knex.schema.alterTable('orders', (table) => {
        table.index(['user_id', 'status'], 'idx_orders_user_status');
      });
    }
  } catch {}
}

export async function down(knex: Knex): Promise<void> {
  try {
    await knex.schema.alterTable('event_registrations', (table) => {
      table.dropIndex(['event_id', 'status'], 'idx_reg_event_status');
    });
    await knex.schema.alterTable('orders', (table) => {
      table.dropIndex(['user_id', 'status'], 'idx_orders_user_status');
    });
  } catch {}
}
