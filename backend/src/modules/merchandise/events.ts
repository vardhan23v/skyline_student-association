import { EventEmitter } from 'node:events';
import { logger } from '../../lib/logger';
import { adminOrderRow } from './service';

/**
 * In-process order bus for GET /api/admin/orders/stream. One Railway instance (numReplicas 1) means every write
 * happens in this process, so no broker is needed; with replicas > 1 this must move to Redis pub/sub or similar.
 */
export const orderBus = new EventEmitter();
orderBus.setMaxListeners(200); // one listener per open admin dashboard

/** Call after the order's transaction has committed, so listeners never see a row that might still roll back. */
export function emitOrder(order_id: number) {
  adminOrderRow(order_id)
    .then((row) => { if (row) orderBus.emit('order', row); })
    .catch((err) => logger.error({ err, order_id }, 'order event failed'));
}
