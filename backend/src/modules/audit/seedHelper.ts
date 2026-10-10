import type { Knex } from 'knex';
import { nanoid } from 'nanoid';

export async function seedAuditHistory(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('audit_logs');
  if (!hasTable) return;

  const countRes = await knex('audit_logs').count<{ count: string | number }>('* as count').first();
  if (Number(countRes?.count || 0) > 0) return;

  const sampleEvents = [
    {
      id: nanoid(),
      action: 'SYSTEM_BOOT',
      entity_type: 'system',
      entity_id: 'server',
      metadata: JSON.stringify({ environment: 'production', version: '2.0.0' }),
      ip_address: '127.0.0.1',
      created_at: new Date(Date.now() - 3600 * 24 * 3 * 1000),
    },
    {
      id: nanoid(),
      action: 'PRICE_UPDATE',
      entity_type: 'product',
      entity_id: 'prod_hoodie_01',
      metadata: JSON.stringify({ oldPrice: 3800, newPrice: 3500 }),
      ip_address: '192.168.1.10',
      created_at: new Date(Date.now() - 3600 * 24 * 2 * 1000),
    },
    {
      id: nanoid(),
      action: 'EVENT_PUBLISH',
      entity_type: 'event',
      entity_id: 'event_gala_01',
      metadata: JSON.stringify({ title: 'Skyline Spring Gala 2026' }),
      ip_address: '192.168.1.10',
      created_at: new Date(Date.now() - 3600 * 12 * 1000),
    },
  ];

  await knex('audit_logs').insert(sampleEvents);
}
