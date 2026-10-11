import type { Knex } from 'knex';

/**
 * A cover photo (with its alt text) and the two facts every event card shows: how long it runs and who can take part.
 * `category` already exists (20261010121600_event_tags_categories). All nullable: events without a photo show none.
 */
export async function up(k: Knex): Promise<void> {
  await k.schema.alterTable('events', (t) => {
    t.string('image_url', 500).nullable();
    t.string('image_alt', 300).nullable();
    t.string('duration', 60).nullable();
    t.string('participation', 120).nullable();
  });
}

export async function down(k: Knex): Promise<void> {
  await k.schema.alterTable('events', (t) => { t.dropColumn('image_url'); t.dropColumn('image_alt'); t.dropColumn('duration'); t.dropColumn('participation'); });
}
