import { z } from 'zod';
export const idParam = z.object({ id: z.coerce.number().int().positive() });
export const eventBody = z.object({
  title: z.string().min(1).max(200), description: z.string().max(5000).optional(),
  starts_at: z.coerce.date(), venue: z.string().max(200).optional(),
  capacity: z.coerce.number().int().positive().max(1_000_000),
  // Members pay member_price, everyone else non_member_price; members_only events turn non-members away (403).
  member_price: z.coerce.number().min(0).max(1e9), non_member_price: z.coerce.number().min(0).max(1e9).optional(),
  members_only: z.boolean().optional(),
  sales_open_at: z.coerce.date().optional(), sales_close_at: z.coerce.date().optional(),
  status: z.enum(['draft', 'published', 'closed']).optional(),
});
export const checkinBody = z.object({ qr_token: z.string().min(10), event_id: z.coerce.number().int().positive().optional() });
