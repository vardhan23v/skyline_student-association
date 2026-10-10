import { z } from 'zod';
export const registerSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(190),
  password: z.string().min(8).max(128),
  student_id: z.string().min(1).max(40).optional(),
  phone: z.string().max(30).optional(),
});
export const loginSchema = z.object({ email: z.string().email(), password: z.string() });
