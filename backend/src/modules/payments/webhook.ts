import { Router, raw } from 'express';
import { getDb, lockRow } from '../../config/db';
import { paymentProvider } from './provider';
import { asyncHandler } from '../../middleware/errorHandler';
import { logger } from '../../lib/logger';
import { onPaymentPaid } from './onPaid';
import { recordEntry } from '../finance/service';

export const webhookRouter = Router();

/**
 * POST /api/webhooks/payment — verify HMAC over the raw body BEFORE parsing. Idempotent on provider_payment_id.
 * The payments.status → 'paid' flip happens here and in treasurer cash entry only (§8).
 */
webhookRouter.post('/payment', raw({ type: '*/*', limit: '1mb' }), asyncHandler(async (req, res) => {
  const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
  const sig = (req.headers['x-razorpay-signature'] ?? req.headers['x-webhook-signature']) as string | undefined;
  const ok = paymentProvider.verifySignature(rawBody, sig);
  const db = getDb();
  const text = rawBody.toString('utf8');
  // Unsigned requests can come from anyone: keep only a prefix so they cannot fill the table (or overflow MySQL TEXT → 500).
  const [whId] = await db('webhook_events').insert({ provider: paymentProvider.name, raw_body: ok ? text : text.slice(0, 2000), signature_ok: ok });
  if (!ok) {
    await db('webhook_events').where({ id: whId }).update({ result: 'bad_signature' });
    return res.status(400).json({ error: 'Invalid signature' });
  }
  let body: unknown;
  try { body = JSON.parse(text); } catch {
    await db('webhook_events').where({ id: whId }).update({ result: 'invalid_json' });
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  const parsed = paymentProvider.parseWebhook(body);
  if (!parsed) {
    await db('webhook_events').where({ id: whId }).update({ result: 'ignored' });
    return res.json({ ok: true, ignored: true });
  }

  const result = await db.transaction(async (trx) => {
    const payment = await lockRow(trx('payments').where({ provider_order_id: parsed.provider_order_id })).first();
    if (!payment) return 'unknown_order';
    if (payment.status === 'paid') return 'already_paid';
    if (payment.status === 'refunded') return 'already_refunded';
    if (parsed.status === 'failed') {
      await trx('payments').where({ id: payment.id }).update({ status: 'failed', provider_payment_id: parsed.provider_payment_id });
      return 'failed';
    }
    if (!(Math.abs(Number(payment.amount) - parsed.amount) <= 0.005)) { // also catches a missing/NaN amount
      logger.warn({ payment_id: payment.id, expected: payment.amount, got: parsed.amount }, 'webhook amount mismatch');
      return 'amount_mismatch';
    }
    await trx('payments').where({ id: payment.id }).update({ status: 'paid', paid_at: new Date(), provider_payment_id: parsed.provider_payment_id });
    await onPaymentPaid(trx, { ...payment, status: 'paid' });
    // §4.3(4): every paid payment has exactly one ledger row. If the item could not take the money (its hold expired and
    // the ticket/order was cancelled, or the membership was already paid for) the money still arrived: book it, flag a refund.
    if (Number(payment.amount) > 0 && !(await trx('ledger_entries').where({ source_type: 'payment', source_id: payment.id }).first())) {
      await recordEntry(trx, {
        direction: 'in', amount: Number(payment.amount), category: payment.purpose, source_type: 'payment', source_id: payment.id,
        memo: `Unfulfilled ${payment.reference_type} #${payment.reference_id}: refund due`, entered_by: payment.user_id,
      });
      logger.error({ payment_id: payment.id, reference_type: payment.reference_type, reference_id: payment.reference_id }, 'payment captured but nothing was fulfilled: refund due');
      return 'paid_unfulfilled';
    }
    return 'confirmed';
  });
  await db('webhook_events').where({ id: whId }).update({ result });
  res.json({ ok: true, result });
}));
