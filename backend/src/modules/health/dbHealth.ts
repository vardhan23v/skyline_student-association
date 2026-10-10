import { getDb } from '../../config/db';

export interface DbHealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  timestamp: string;
  client: string;
}

export async function checkDatabaseHealth(): Promise<DbHealthReport> {
  const db = getDb();
  const start = Date.now();
  try {
    await db.raw('SELECT 1');
    const latencyMs = Date.now() - start;
    return {
      status: latencyMs > 500 ? 'degraded' : 'healthy',
      latencyMs,
      timestamp: new Date().toISOString(),
      client: db.client.config.client || 'unknown',
    };
  } catch {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
      client: 'unknown',
    };
  }
}
