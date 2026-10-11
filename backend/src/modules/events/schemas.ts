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
  // Cover photo: a file the site serves (/media/…) or an https URL. Empty string clears it.
  image_url: z.union([z.literal(''), z.string().max(500).regex(/^(\/media\/[\w./-]+|https:\/\/\S+)$/, 'Use a /media/… path or an https:// URL')]).nullable().optional(),
  image_alt: z.string().max(300).nullable().optional(),
  category: z.string().trim().max(100).optional(),
  duration: z.string().trim().max(60).nullable().optional(),
  participation: z.string().trim().max(120).nullable().optional(),
});
export const listQuery = z.object({ when: z.enum(['past', 'upcoming']).optional() });
export const checkinBody = z.object({ qr_token: z.string().min(10), event_id: z.coerce.number().int().positive().optional() });
