import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16).default('dev-only-secret-change-me-please'),
  QR_SECRET: z.string().min(8).default('dev-only-qr-secret'),
  PAYMENT_PROVIDER: z.enum(['razorpay', 'stripe']).default('razorpay'),
  PAYMENT_WEBHOOK_SECRET: z.string().default('whsec_test'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  EMAIL_FROM: z.string().default('ssa@example.com'),
  RESEND_API_KEY: z.string().optional(),
  CLOUDINARY_URL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  PENDING_HOLD_MINUTES: z.coerce.number().default(15),
  MEMBERSHIP_YEAR_END: z.string().default('06-30'), // MM-DD academic year end
});

export const env = schema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
