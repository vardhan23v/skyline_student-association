import { z } from 'zod';
export const registerSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(190),
  password: z.string().min(8).max(128),
  student_id: z.string().min(1).max(40).optional(),
  phone: z.string().max(30).optional(),
});
export const loginSchema = z.object({ email: z.string().email(), password: z.string() });
/** At least 8 characters with a letter and a number (password resets and set-password links). */
export const newPassword = z.string().min(8, 'Use at least 8 characters.').max(128)
  .regex(/[A-Za-z]/, 'Include at least one letter.').regex(/\d/, 'Include at least one number.');
export const forgotPasswordSchema = z.object({ email: z.string().trim().email().max(190) });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: newPassword });
