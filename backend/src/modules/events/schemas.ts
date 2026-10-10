import { z } from 'zod';
export const idParam = z.object({ id: z.coerce.number().int().positive() });
export const eventBody = z.object({
  title: z.string().min(1).max(200), description: z.string().max(5000).optional(),
  starts_at: z.coerce.date(), venue: z.string().max(200).optional(),
  capacity: z.coerce.number().int().positive().max(1_000_000),
  member_price: z.coerce.number().min(0).max(1e9), non_member_price: z.coerce.number().min(0).max(1e9),
  sales_open_at: z.coerce.date().optional(), sales_close_at: z.coerce.date().optional(),
  status: z.enum(['draft', 'published', 'closed']).optional(),
});
export const buyBody = z.object({ holder_name: z.string().min(1).max(120).optional(), holder_email: z.string().email().max(190).optional() });
export const checkinBody = z.object({ qr_token: z.string().min(10), event_id: z.coerce.number().int().positive().optional() });
export const cashTicketBody = z.object({ holder_name: z.string().min(1).max(120), holder_email: z.string().email().max(190), member_id: z.coerce.number().int().positive().optional() });
