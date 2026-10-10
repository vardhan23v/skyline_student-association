import { z } from 'zod';
export const idParam = z.object({ id: z.coerce.number().int().positive() });
export const cashDuesSchema = z.object({ amount: z.coerce.number().positive(), expiry_date: z.string().date().optional() });
// No client-chosen amount: dues are DEFAULT_DUES. A user without a member profile supplies their student ID here.
export const startDuesSchema = z.object({ student_id: z.string().trim().min(1).max(40).optional(), phone: z.string().max(30).optional() });
export const listMembersQuery = z.object({
  status: z.enum(['active', 'expired', 'pending', 'none']).optional(),
  expiring_within_days: z.coerce.number().int().positive().optional(),
  q: z.string().optional(),
});
export const verifyQuery = z.object({ qr_token: z.string().optional() });
export const DEFAULT_DUES = 500;

export const MEMBERSHIP_BENEFITS = [
  'Register for every SSA event',
  'Member prices on all merch',
  'Members-only announcements and early event news',
  'Renewal reminders before your membership runs out',
];
/** What GET /api/membership/info and the MEMBERSHIP_REQUIRED error both show. */
export const membershipOffer = () => ({ price: DEFAULT_DUES, currency: 'INR', benefits: MEMBERSHIP_BENEFITS });
