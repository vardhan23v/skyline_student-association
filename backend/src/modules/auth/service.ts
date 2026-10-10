import bcrypt from 'bcryptjs';
import type { Knex } from 'knex';
import { getDb } from '../../config/db';
import { env, appUrl } from '../../config/env';
import { HttpError, conflict, unauthorized } from '../../lib/errors';
import { randomToken, sha256 } from '../../lib/hash';
import { sendMail } from '../../lib/email';
import { logger } from '../../lib/logger';
import { logAuditEvent } from '../audit/service';
import { signToken, type Role } from '../../middleware/auth';
import { todayYmd } from '../../lib/dates';

/** Compared against when the email is unknown, so a failed login takes as long whether or not the account exists. */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export type UserRow = { id: number; name: string; email: string; password_hash: string; role: Role; is_active: number | boolean };

export async function register(input: { name: string; email: string; password: string; student_id?: string; phone?: string }, role: Role = 'user') {
  const db = getDb();
  const existing = await db('users').where({ email: input.email.toLowerCase() }).first();
  if (existing) throw conflict('Email already registered');
  const password_hash = await bcrypt.hash(input.password, 10);
  return db.transaction(async (trx) => {
    const [id] = await trx('users').insert({ name: input.name, email: input.email.toLowerCase(), password_hash, role });
    if (input.student_id) {
      const dup = await trx('members').where({ student_id: input.student_id }).first();
      if (dup) throw conflict('Student ID already registered');
      await trx('members').insert({ user_id: id, student_id: input.student_id, phone: input.phone ?? null, joined_at: todayYmd() }); // DATE column: a calendar day, not a timestamp
    }
    const user = (await trx('users').where({ id }).first()) as UserRow;
    return { user: publicUser(user), token: signToken({ id: user.id, role: user.role, email: user.email }) };
  });
}

export async function login(email: string, password: string) {
  const user = (await getDb()('users').where({ email: email.toLowerCase() }).first()) as UserRow | undefined;
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !user.is_active || !ok) throw unauthorized('Invalid credentials');
  return { user: publicUser(user), token: signToken({ id: user.id, role: user.role, email: user.email }) };
}

export const publicUser = (u: UserRow) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

export type TokenPurpose = 'reset' | 'setup';
export const RESET_TTL_MINUTES = 60;
export const SETUP_TTL_MINUTES = 72 * 60;
const invalidToken = () => new HttpError(400, 'This link is invalid or has expired. Request a new one.', 'INVALID_TOKEN');
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * A one-time password link for `user_id`: 32 random bytes, of which only the SHA-256 is stored. Returns the raw token
 * (it goes in the emailed link and nowhere else). Setup tokens (Section B) last 72 hours, reset tokens 60 minutes.
 */
export async function createPasswordToken(user_id: number, purpose: TokenPurpose, ttlMinutes: number, db: Knex = getDb()) {
  const token = randomToken(32);
  await db('password_tokens').insert({ user_id, token_hash: sha256(token), purpose, expires_at: new Date(Date.now() + ttlMinutes * 60_000) });
  return token;
}

/** The link a token goes in: /reset-password?token=…, with &setup=1 so the page can say "set your password". */
export const passwordLink = (token: string, purpose: TokenPurpose) => `/reset-password?token=${encodeURIComponent(token)}${purpose === 'setup' ? '&setup=1' : ''}`;

/**
 * POST /auth/forgot-password. The caller always gets the same answer, so it can't be used to find out who has an
 * account. For an active user, emails a 60-minute reset link. Without Resend the link is logged instead, so an admin
 * with log access can still help someone back in (that's what "email not configured" means here).
 */
export async function forgotPassword(email: string) {
  const user = (await getDb()('users').where({ email: email.toLowerCase() }).first()) as UserRow | undefined;
  if (user && user.is_active) {
    const token = await createPasswordToken(user.id, 'reset', RESET_TTL_MINUTES);
    const path = passwordLink(token, 'reset');
    if (!env.RESEND_API_KEY) logger.info({ to: user.email, url: appUrl(path) }, 'password reset link (email not configured)');
    void sendMail({
      to: user.email,
      subject: 'Reset your SSA password',
      html: `<p>Hi ${esc(user.name)},</p><p>Someone asked to reset the password for your Skyline Student Association account. The link works once and expires in ${RESET_TTL_MINUTES} minutes.</p>`
        + `<p><a href="${appUrl(path)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#F6E9CE;color:#0B0B0D;text-decoration:none;font-weight:700">Choose a new password</a></p>`
        + `<p>If it wasn't you, ignore this email; your password stays the same.</p>`,
    });
  }
  return { ok: true, message: 'If that email has an SSA account, a reset link is on its way. It expires in 60 minutes.' };
}

/**
 * POST /auth/reset-password. The token must exist, be unused and unexpired (all checked in SQL, so the expiry compares
 * in the database's own time format). Sets the password, marks this token used and every other open token of the user
 * too, so an older link in someone's inbox stops working.
 */
export async function resetPassword(token: string, password: string, ip?: string) {
  const db = getDb();
  const password_hash = await bcrypt.hash(password, 10);
  const result = await db.transaction(async (trx) => {
    const row = await trx('password_tokens').where({ token_hash: sha256(token) }).whereNull('used_at').where('expires_at', '>', new Date()).first();
    if (!row) throw invalidToken();
    // Conditional claim: two submits of the same link can't both succeed.
    const claimed = await trx('password_tokens').where({ id: row.id }).whereNull('used_at').update({ used_at: new Date() });
    if (!claimed) throw invalidToken();
    const user = await trx('users').where({ id: row.user_id }).first();
    if (!user || !user.is_active) throw invalidToken();
    await trx('users').where({ id: user.id }).update({ password_hash, updated_at: trx.fn.now() });
    await trx('password_tokens').where({ user_id: user.id }).whereNull('used_at').update({ used_at: new Date() });
    return { user_id: Number(user.id), purpose: row.purpose as TokenPurpose };
  });
  await logAuditEvent({ userId: String(result.user_id), action: 'password_reset', entityType: 'user', entityId: String(result.user_id), metadata: { purpose: result.purpose }, ipAddress: ip ?? null });
  return { ok: true, purpose: result.purpose };
}
