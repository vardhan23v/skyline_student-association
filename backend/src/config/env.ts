import 'dotenv/config';
import { z } from 'zod';

const validTimeZone = (tz: string) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().optional(),
  // Secrets have dev-only fallbacks below; production must set them explicitly (a known default lets anyone forge tokens).
  JWT_SECRET: z.string().min(16).optional(),
  QR_SECRET: z.string().min(8).optional(),
  PAYMENT_PROVIDER: z.enum(['razorpay', 'stripe']).default('razorpay'),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  EMAIL_FROM: z.string().default('ssa@example.com'),
  RESEND_API_KEY: z.string().optional(),
  CLOUDINARY_URL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  PENDING_HOLD_MINUTES: z.coerce.number().default(15),
  MEMBERSHIP_YEAR_END: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'MM-DD').default('06-30'), // academic year end
  // The club's calendar: "today" for membership expiry/reminders and the cron schedules.
  APP_TIMEZONE: z.string().refine(validTimeZone, 'Unknown IANA time zone').default('Asia/Kolkata'),
  // Demo checkout: POST /api/payments/demo-confirm/:id marks a payment paid. Ignored while Razorpay keys are set.
  DEMO_PAYMENTS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

const parsed = schema.parse(process.env);
const prod = parsed.NODE_ENV === 'production';

if (prod) {
  const missing = (['JWT_SECRET', 'QR_SECRET'] as const).filter((k) => !parsed[k]);
  if (missing.length) throw new Error(`Missing required secret(s) in production: ${missing.join(', ')}`);
  if (parsed.JWT_SECRET === parsed.QR_SECRET) throw new Error('QR_SECRET must differ from JWT_SECRET');
}

export const env = {
  ...parsed,
  JWT_SECRET: parsed.JWT_SECRET ?? 'dev-only-secret-change-me-please',
  QR_SECRET: parsed.QR_SECRET ?? 'dev-only-qr-secret',
  // Empty in production until Razorpay is configured: every webhook is then rejected instead of trusting a public default.
  PAYMENT_WEBHOOK_SECRET: parsed.PAYMENT_WEBHOOK_SECRET ?? (prod ? '' : 'whsec_test'),
};
export const isProd = prod;
/** Demo payments only stand in for a missing gateway: with Razorpay keys configured, money must go through Razorpay. */
export const demoPaymentsEnabled = () => env.DEMO_PAYMENTS && !(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
export const isTest = env.NODE_ENV === 'test';
