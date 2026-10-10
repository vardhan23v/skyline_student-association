import { api } from './client';

export interface AuditLogItem {
  id: string;
  user_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  metadata?: string | null;
  ip_address?: string | null;
  created_at: string;
}

export interface AuditLogsResponse {
  logs: AuditLogItem[];
  total: number;
}

export async function fetchAuditLogs(limit = 50, offset = 0): Promise<AuditLogsResponse> {
  return api<AuditLogsResponse>(`/admin/audit-logs?limit=${limit}&offset=${offset}`);
}
