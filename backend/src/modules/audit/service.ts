import { getDb } from '../../config/db';
import { nanoid } from 'nanoid';
import { CreateAuditLogParams, AuditLogEntry } from './types';

export async function logAuditEvent(params: CreateAuditLogParams): Promise<void> {
  try {
    const db = getDb();
    const id = nanoid();
    const metadataStr = params.metadata ? JSON.stringify(params.metadata) : null;

    await db('audit_logs').insert({
      id,
      user_id: params.userId || null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      metadata: metadataStr,
      ip_address: params.ipAddress || null,
      created_at: new Date(),
    });
  } catch (err) {
    console.error('[AUDIT_LOG_ERROR]', err);
  }
}

export async function listAuditLogs(limit = 50, offset = 0): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const db = getDb();
  const totalRes = await db('audit_logs').count<{ count: string | number }>('* as count').first();
  const total = Number(totalRes?.count || 0);

  const logs = await db<AuditLogEntry>('audit_logs')
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset(offset);

  return { logs, total };
}
