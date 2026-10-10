import { z } from 'zod';
export const idParam = z.object({ id: z.coerce.number().int().positive() });
export const cashDuesSchema = z.object({ amount: z.coerce.number().positive(), expiry_date: z.string().date().optional() });
export const startDuesSchema = z.object({ amount: z.coerce.number().positive().optional() });
export const listMembersQuery = z.object({
  status: z.enum(['active', 'expired', 'pending', 'none']).optional(),
  expiring_within_days: z.coerce.number().int().positive().optional(),
  q: z.string().optional(),
});
export const verifyQuery = z.object({ qr_token: z.string().optional() });
export const DEFAULT_DUES = 500;
