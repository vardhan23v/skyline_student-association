import { Router, raw } from 'express';
import { getDb, lockRow } from '../../config/db';
import { paymentProvider } from './provider';
import { asyncHandler } from '../../middleware/errorHandler';
import { logger } from '../../lib/logger';
import { onPaymentPaid } from './onPaid';

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
  const [whId] = await db('webhook_events').insert({ provider: paymentProvider.name, raw_body: rawBody.toString('utf8'), signature_ok: ok });
  if (!ok) {
    await db('webhook_events').where({ id: whId }).update({ result: 'bad_signature' });
    return res.status(400).json({ error: 'Invalid signature' });
  }
  const parsed = paymentProvider.parseWebhook(JSON.parse(rawBody.toString('utf8')));
  if (!parsed) {
    await db('webhook_events').where({ id: whId }).update({ result: 'ignored' });
    return res.json({ ok: true, ignored: true });
  }

  const result = await db.transaction(async (trx) => {
    const payment = await lockRow(trx('payments').where({ provider_order_id: parsed.provider_order_id })).first();
    if (!payment) return 'unknown_order';
    if (payment.status === 'paid') return 'already_paid';
    if (parsed.status === 'failed') {
      await trx('payments').where({ id: payment.id }).update({ status: 'failed', provider_payment_id: parsed.provider_payment_id });
      return 'failed';
    }
    if (Math.abs(Number(payment.amount) - parsed.amount) > 0.005) {
      logger.warn({ payment_id: payment.id, expected: payment.amount, got: parsed.amount }, 'webhook amount mismatch');
      return 'amount_mismatch';
    }
    await trx('payments').where({ id: payment.id }).update({ status: 'paid', paid_at: new Date(), provider_payment_id: parsed.provider_payment_id });
    await onPaymentPaid(trx, { ...payment, status: 'paid' });
    return 'confirmed';
  });
  await db('webhook_events').where({ id: whId }).update({ result });
  res.json({ ok: true, result });
}));
