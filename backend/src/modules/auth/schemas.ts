import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, refinePassword } from '../../lib/password';

const password = z.string().max(MAX_PASSWORD_LENGTH);

/** Register: the password is checked against the rules and the person's own email, name and student ID. */
export const registerSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(190),
  password,
  student_id: z.string().min(1).max(40).optional(),
  phone: z.string().max(30).optional(),
}).superRefine((b, ctx) => refinePassword(b.password, ctx, { email: b.email, name: b.name, studentId: b.student_id }, ['password']));
export const loginSchema = z.object({ email: z.string().email(), password: z.string().max(MAX_PASSWORD_LENGTH) });
/** New passwords without an account in the body (reset and set-password links): the general rules here; the service
 *  adds the account's own email, name and student ID once the token says whose it is. */
export const newPassword = password.superRefine((pw, ctx) => refinePassword(pw, ctx));
export const forgotPasswordSchema = z.object({ email: z.string().trim().email().max(190) });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: newPassword });
/** Signed in: change your own password (needs the current one). */
export const changePasswordSchema = z.object({ current_password: z.string().min(1).max(MAX_PASSWORD_LENGTH), password: newPassword });
