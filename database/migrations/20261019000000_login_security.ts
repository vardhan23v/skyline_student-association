import type { Knex } from 'knex';

/**
 * Per-account login lockout and the "please update your password" flag:
 * - failed_logins / last_failed_login_at: wrong passwords in the current 15-minute window;
 * - locked_until: set after the 5th, the account refuses every login (even the right password) until then;
 * - password_weak: the password in use was set before the current rules and doesn't meet them (checked at login).
 */
export async function up(k: Knex): Promise<void> {
  await k.schema.alterTable('users', (t) => {
    t.integer('failed_logins').unsigned().notNullable().defaultTo(0);
    t.timestamp('last_failed_login_at').nullable();
    t.timestamp('locked_until').nullable();
    t.boolean('password_weak').notNullable().defaultTo(false);
  });
}

export async function down(k: Knex): Promise<void> {
  await k.schema.alterTable('users', (t) => { t.dropColumn('failed_logins'); t.dropColumn('last_failed_login_at'); t.dropColumn('locked_until'); t.dropColumn('password_weak'); });
}
