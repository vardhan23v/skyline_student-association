import type { Knex } from 'knex';

/** One-time password links: `reset` (forgot password, 60 min) and `setup` (accounts created by an admin, 72 h). Only a SHA-256 of the token is stored. */
export async function up(k: Knex): Promise<void> {
  await k.schema.createTable('password_tokens', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable().references('users.id').onDelete('CASCADE');
    t.string('token_hash', 64).notNullable().unique();
    t.enum('purpose', ['reset', 'setup']).notNullable();
    t.timestamp('expires_at').notNullable();
    t.timestamp('used_at').nullable();
    t.timestamp('created_at').notNullable().defaultTo(k.fn.now());
    t.index(['user_id']);
  });
}

export async function down(k: Knex): Promise<void> {
  await k.schema.dropTable('password_tokens');
}
