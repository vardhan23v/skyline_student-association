import type { Knex } from 'knex';
import { getDb, lockRow } from '../../config/db';
import { paymentProvider, type CheckoutParams } from './provider';
import { demoPaymentsEnabled, env } from '../../config/env';
import { logger } from '../../lib/logger';
import { recordEntry } from '../finance/service';
import { onPaymentPaid } from './onPaid';

export type Purpose = 'dues' | 'ticket' | 'merch';
/** What a client needs to pay: the provider order, plus our payment id (the demo-confirm path takes it). */
export type Checkout = CheckoutParams & { payment_id: number; demo: boolean };

/** Insert a pending payment row inside the caller's transaction and create the provider order. */
export async function createPendingPayment(trx: Knex.Transaction, p: { user_id: number | null; amount: number; purpose: Purpose; reference_type: string; reference_id: number }) {
  const [id] = await trx('payments').insert({ ...p, currency: 'INR', provider: env.PAYMENT_PROVIDER, status: 'pending' });
  const order = await paymentProvider.createOrder(p.amount, 'INR', `${p.reference_type}_${p.reference_id}`);
  await trx('payments').where({ id }).update({ provider_order_id: order.order_id });
  return { payment_id: id as number, checkout: toCheckout(order, id as number) };
}

export const toCheckout = (order: CheckoutParams, payment_id: number): Checkout => ({ ...order, payment_id, demo: demoPaymentsEnabled() });

/** Checkout params for a payment that is still pending (resume an abandoned checkout instead of opening a second one). */
export function checkoutFor(payment: { id: number; amount: number | string; currency: string; provider_order_id: string | null }): Checkout | null {
  if (!payment.provider_order_id) return null;
  const live = env.PAYMENT_PROVIDER === 'razorpay' && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET;
  return toCheckout({ provider: live ? 'razorpay' : `${env.PAYMENT_PROVIDER}-sandbox`, order_id: payment.provider_order_id, amount: Number(payment.amount), currency: payment.currency, ...(live ? { key_id: env.RAZORPAY_KEY_ID } : {}) }, payment.id);
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

export type SettleResult = 'confirmed' | 'already_paid' | 'already_refunded' | 'paid_unfulfilled';

/**
 * The one place a captured payment takes effect: the Razorpay webhook, demo-confirm and an admin recording cash all
 * call this, so activation, ticket confirmation, stock and the ledger behave identically whichever way money arrives.
 * `payment` must be locked by the caller. `entered_by` is the ledger author (defaults to the payer).
 */
export async function settlePayment(trx: Knex.Transaction, payment: any, provider_payment_id: string, opts: { entered_by?: number; provider?: 'cash' } = {}): Promise<SettleResult> {
  if (payment.status === 'paid') return 'already_paid';
  if (payment.status === 'refunded') return 'already_refunded';
  await trx('payments').where({ id: payment.id }).update({ status: 'paid', paid_at: new Date(), provider_payment_id, ...(opts.provider ? { provider: opts.provider } : {}) });
  await onPaymentPaid(trx, { ...payment, status: 'paid' }, opts.entered_by);
  // §4.3(4): every paid payment has exactly one ledger row. If the item could not take the money (its hold expired and
  // the ticket/order was cancelled, or the membership was already paid for) the money still arrived: book it, flag a refund.
  if (Number(payment.amount) > 0 && !(await trx('ledger_entries').where({ source_type: 'payment', source_id: payment.id }).first())) {
    await recordEntry(trx, {
      direction: 'in', amount: Number(payment.amount), category: payment.purpose, source_type: 'payment', source_id: payment.id,
      memo: `Unfulfilled ${payment.reference_type} #${payment.reference_id}: refund due`, entered_by: opts.entered_by ?? payment.user_id,
    });
    logger.error({ payment_id: payment.id, reference_type: payment.reference_type, reference_id: payment.reference_id }, 'payment captured but nothing was fulfilled: refund due');
    return 'paid_unfulfilled';
  }
  return 'confirmed';
}

/** Lock a payment by id and settle it. */
export async function settlePaymentById(payment_id: number, provider_payment_id: string, opts: { entered_by?: number; provider?: 'cash' } = {}) {
  return getDb().transaction(async (trx) => {
    const payment = await lockRow(trx('payments').where({ id: payment_id })).first();
    return { payment, result: payment ? await settlePayment(trx, payment, provider_payment_id, opts) : null };
  });
}
