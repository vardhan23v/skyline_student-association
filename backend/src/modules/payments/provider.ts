import { env } from '../../config/env';
import { hmacSha256, safeEqual } from '../../lib/hash';

export type CheckoutParams = { provider: string; order_id: string; amount: number; currency: string; key_id?: string; checkout_url?: string };
export type WebhookResult = { provider_order_id: string; provider_payment_id: string; status: 'paid' | 'failed'; amount: number };

/**
 * Provider adapter. Razorpay: create order via REST, verify `X-Razorpay-Signature` (HMAC-SHA256 of raw body).
 * Without API keys (dev/test) we mint a local order id so the flow stays testable end-to-end.
 */
export const paymentProvider = {
  name: env.PAYMENT_PROVIDER,

  async createOrder(amount: number, currency: string, receipt: string): Promise<CheckoutParams> {
    if (env.PAYMENT_PROVIDER === 'razorpay' && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: Math.round(amount * 100), currency, receipt }),
      });
      if (!res.ok) throw new Error(`Razorpay order failed: ${res.status}`);
      const o = (await res.json()) as { id: string };
      return { provider: 'razorpay', order_id: o.id, amount, currency, key_id: env.RAZORPAY_KEY_ID };
    }
    return { provider: `${env.PAYMENT_PROVIDER}-sandbox`, order_id: `order_${receipt}_${Date.now()}`, amount, currency };
  },

  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    return safeEqual(hmacSha256(env.PAYMENT_WEBHOOK_SECRET, rawBody), signature);
  },

  /** Normalise the provider payload. Razorpay `payment.captured` / `payment.failed`; sandbox uses the same shape. */
  parseWebhook(body: any): WebhookResult | null {
    const p = body?.payload?.payment?.entity;
    if (!p) return null;
    const status = body.event === 'payment.captured' ? 'paid' : body.event === 'payment.failed' ? 'failed' : null;
    if (!status) return null;
    return { provider_order_id: p.order_id, provider_payment_id: p.id, status, amount: Number(p.amount) / 100 };
  },
};
