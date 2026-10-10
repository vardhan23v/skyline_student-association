import type { Knex } from 'knex';
import { getDb } from '../config/db';

export async function withTransaction<T>(
  callback: (trx: Knex.Transaction) => Promise<T>,
  options?: { isolationLevel?: Knex.IsolationLevels; maxRetries?: number }
): Promise<T> {
  const db = getDb();
  const maxRetries = options?.maxRetries ?? 2;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      return await db.transaction(async (trx) => {
        if (options?.isolationLevel) {
          await trx.raw(`SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`);
        }
        return await callback(trx);
      });
    } catch (err: unknown) {
      attempt++;
      const isDeadlock = (err as { code?: string })?.code === '40P01' || (err as { message?: string })?.message?.includes('deadlock');
      if (isDeadlock && attempt <= maxRetries) {
        await new Promise((res) => setTimeout(res, 50 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Transaction failed after maximum retries');
}
