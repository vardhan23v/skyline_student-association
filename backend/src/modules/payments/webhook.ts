import { Router, raw } from 'express';
import { getDb, lockRow } from '../../config/db';
import { paymentProvider } from './provider';
import { asyncHandler } from '../../middleware/errorHandler';
import { logger } from '../../lib/logger';
import { settlePayment } from './service';
import { emitOrder } from '../merchandise/events';

export const webhookRouter = Router();

/**
 * POST /api/webhooks/payment — verify HMAC over the raw body BEFORE parsing. Idempotent on provider_payment_id.
 * The payments.status → 'paid' flip goes through settlePayment only (this webhook, demo-confirm, admin cash entry).
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

  let settledOrder: number | null = null;
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
    const r = await settlePayment(trx, payment, parsed.provider_payment_id);
    if (payment.purpose === 'merch') settledOrder = payment.reference_id;
    return r;
  });
  if (settledOrder) emitOrder(settledOrder);
  await db('webhook_events').where({ id: whId }).update({ result });
  res.json({ ok: true, result });
}));
