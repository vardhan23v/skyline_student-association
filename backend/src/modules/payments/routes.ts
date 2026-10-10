import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import { demoPaymentsEnabled } from '../../config/env';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { getDb } from '../../config/db';
import { settlePaymentById } from './service';
import { emitOrder } from '../merchandise/events';

export const paymentsRouter = Router();

/**
 * POST /api/payments/demo-confirm/:paymentId — stands in for the Razorpay webhook while no gateway is configured
 * (DEMO_PAYMENTS=true and no Razorpay keys). Runs the same settlePayment path, so activation, tickets, stock and the
 * ledger come out identical. Otherwise the route does not exist (404), whoever asks. Only the payer can confirm.
 */
paymentsRouter.post('/demo-confirm/:paymentId',
  (_req, _res, next) => next(demoPaymentsEnabled() ? undefined : notFound('Route not found')),
  requireAuth,
  validate({ params: z.object({ paymentId: z.coerce.number().int().positive() }) }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.paymentId);
    const p = await getDb()('payments').where({ id }).first();
    if (!p) throw notFound('Payment not found');
    if (Number(p.user_id) !== req.user!.id) throw forbidden('Only the payer can confirm this payment');
    if (p.status === 'failed') throw conflict('Payment failed; start a new checkout', 'PAYMENT_FAILED');
    const { payment, result } = await settlePaymentById(id, `demo_${id}`);
    if (payment.purpose === 'merch' && result !== 'already_paid') emitOrder(payment.reference_id);
    res.json({ ok: true, result, payment_id: id, purpose: payment.purpose, reference_id: payment.reference_id });
  }));
