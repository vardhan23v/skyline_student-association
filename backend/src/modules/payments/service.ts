import type { Knex } from 'knex';
import { getDb } from '../../config/db';
import { paymentProvider } from './provider';
import { env } from '../../config/env';

export type Purpose = 'dues' | 'ticket' | 'merch';

/** Insert a pending payment row inside the caller's transaction and create the provider order. */
export async function createPendingPayment(trx: Knex.Transaction, p: { user_id: number | null; amount: number; purpose: Purpose; reference_type: string; reference_id: number }) {
  const [id] = await trx('payments').insert({ ...p, currency: 'INR', provider: env.PAYMENT_PROVIDER, status: 'pending' });
  const checkout = await paymentProvider.createOrder(p.amount, 'INR', `${p.reference_type}_${p.reference_id}`);
  await trx('payments').where({ id }).update({ provider_order_id: checkout.order_id });
  return { payment_id: id as number, checkout };
}

/** Treasurer-entered cash payment: immediately `paid`, idempotent key is synthetic. */
export async function createCashPayment(trx: Knex.Transaction, p: { user_id: number | null; amount: number; purpose: Purpose; reference_type: string; reference_id: number }) {
  const [id] = await trx('payments').insert({
    ...p, currency: 'INR', provider: 'cash', status: 'paid', paid_at: new Date(),
    provider_payment_id: `cash_${p.reference_type}_${p.reference_id}_${Date.now()}`,
  });
  return id as number;
}

export const findByOrderId = (order_id: string) => getDb()('payments').where({ provider_order_id: order_id }).first();
