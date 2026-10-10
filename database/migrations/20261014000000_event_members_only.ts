import type { Knex } from 'knex';

/**
 * Member vs non-member ticket pricing is back: any signed-in user can register, members at `member_price` and everyone
 * else at `non_member_price` (no longer a legacy column). `members_only` keeps the hard membership gate on an event.
 * Events that already exist were members-only (and their non_member_price is the old default 0, which would let
 * non-members in free), so they keep the gate until an admin sets a non-member price and unticks it. New events default to open.
 */
export async function up(k: Knex): Promise<void> {
  await k.schema.alterTable('events', (t) => { t.boolean('members_only').notNullable().defaultTo(false); });
  await k('events').update({ members_only: true });
}

export async function down(k: Knex): Promise<void> {
  await k.schema.alterTable('events', (t) => { t.dropColumn('members_only'); });
}
