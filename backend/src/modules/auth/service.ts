import bcrypt from 'bcryptjs';
import { assertStrongPassword, bcryptRounds, hashPassword, needsRehash, validatePassword } from '../../lib/password';
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
let dummyHash: string | null = null;
const dummy = () => (dummyHash ??= bcrypt.hashSync('not-a-real-password', bcryptRounds()));

/** Lockout: this many wrong passwords within the window lock the account for the same length of time. */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
const INVALID_LOGIN = 'Invalid email or password';

export type UserRow = { id: number; name: string; email: string; password_hash: string; role: Role; is_active: number | boolean;
  failed_logins?: number; last_failed_login_at?: Date | string | number | null; locked_until?: Date | string | number | null; password_weak?: number | boolean };
const toMs = (v: Date | string | number | null | undefined) =>
  v == null ? 0 : typeof v === 'number' ? v : v instanceof Date ? v.getTime() : /^\d+$/.test(v) ? Number(v) : new Date(v.includes('T') ? v : `${v.replace(' ', 'T')}Z`).getTime();

/** The account's own details, which a new password must not contain. */
async function passwordContext(db: Knex, user: { id: number; email: string; name: string }) {
  const m = await db('members').where({ user_id: user.id }).first();
  return { email: user.email, name: user.name, studentId: m?.student_id ?? null };
}

/** 409 when the email or student ID is taken; callers can swap in their own error (the walk-in names the field). */
type DuplicateError = (field: 'email' | 'student_id') => Error;
const defaultDuplicate: DuplicateError = (field) => conflict(field === 'email' ? 'Email already registered' : 'Student ID already registered');

/**
 * Create the `users` row and, with a student ID, the `members` row, inside the caller's transaction. Shared by
 * self-registration and admin walk-ins (which pass an unusable password hash and send a set-password link).
 */
export async function createAccount(trx: Knex.Transaction, input: { name: string; email: string; password_hash: string; student_id?: string; phone?: string },
  { role = 'user', duplicate = defaultDuplicate }: { role?: Role; duplicate?: DuplicateError } = {}) {
  const email = input.email.toLowerCase();
  if (await trx('users').where({ email }).first()) throw duplicate('email');
  if (input.student_id && (await trx('members').where({ student_id: input.student_id }).first())) throw duplicate('student_id');
  const [id] = await trx('users').insert({ name: input.name, email, password_hash: input.password_hash, role });
  let member_id: number | null = null;
  if (input.student_id) {
    [member_id] = await trx('members').insert({ user_id: id, student_id: input.student_id, phone: input.phone ?? null, joined_at: todayYmd() }); // DATE column: a calendar day, not a timestamp
  }
  return { user: (await trx('users').where({ id }).first()) as UserRow, member_id: member_id === null ? null : Number(member_id) };
}

export async function register(input: { name: string; email: string; password: string; student_id?: string; phone?: string }, role: Role = 'user') {
  // The schema already checked the rules; this keeps register() safe for any other caller.
  assertStrongPassword(input.password, { email: input.email, name: input.name, studentId: input.student_id });
  const password_hash = await hashPassword(input.password);
  return getDb().transaction(async (trx) => {
    const { user } = await createAccount(trx, { ...input, password_hash }, { role });
    return { user: publicUser(user), token: signToken({ id: user.id, role: user.role, email: user.email }) };
  });
}

/**
 * POST /auth/login. Every failure answers the same "Invalid email or password". Per account: 5 wrong passwords within
 * 15 minutes lock it for 15 minutes, during which even the right password is refused (the IP rate limiter still applies
 * on top). A success clears the counter, upgrades an older bcrypt hash to the current cost, and flags a password that
 * predates the current rules so the app can ask for a new one.
 */
export async function login(email: string, password: string, ip?: string) {
  const db = getDb();
  const user = (await db('users').where({ email: email.toLowerCase() }).first()) as UserRow | undefined;
  const ok = await bcrypt.compare(password, user?.password_hash ?? dummy());
  if (!user || !user.is_active) throw unauthorized(INVALID_LOGIN);
  const now = Date.now();
  if (toMs(user.locked_until) > now) throw unauthorized(INVALID_LOGIN);
  if (!ok) {
    const inWindow = toMs(user.last_failed_login_at) > now - LOCK_MINUTES * 60_000;
    const failed = (inWindow ? Number(user.failed_logins ?? 0) : 0) + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db('users').where({ id: user.id }).update(lock
      ? { failed_logins: 0, last_failed_login_at: null, locked_until: new Date(now + LOCK_MINUTES * 60_000) }
      : { failed_logins: failed, last_failed_login_at: new Date(now) });
    if (lock) await logAuditEvent({ userId: String(user.id), action: 'login_locked', entityType: 'user', entityId: String(user.id), metadata: { minutes: LOCK_MINUTES }, ipAddress: ip ?? null });
    throw unauthorized(INVALID_LOGIN);
  }
  const password_weak = !validatePassword(password, await passwordContext(db, user)).ok;
  await db('users').where({ id: user.id }).update({
    failed_logins: 0, last_failed_login_at: null, locked_until: null, password_weak,
    ...(needsRehash(user.password_hash) ? { password_hash: await hashPassword(password) } : {}),
  });
  return { user: publicUser({ ...user, password_weak }), token: signToken({ id: user.id, role: user.role, email: user.email }) };
}

/**
 * POST /auth/change-password (signed in). The current password must match; the new one meets the rules and isn't the
 * same as the current one. Clears the "please update" flag.
 */
export async function changePassword(user_id: number, current: string, next: string, ip?: string) {
  const db = getDb();
  const user = (await db('users').where({ id: user_id }).first()) as UserRow | undefined;
  if (!user || !(await bcrypt.compare(current, user.password_hash))) throw new HttpError(400, 'Your current password is not right', 'WRONG_PASSWORD');
  if (current === next) throw new HttpError(400, 'Choose a password you haven\'t used here', 'WEAK_PASSWORD', undefined, { errors: ['Use a new password, not your current one'] });
  assertStrongPassword(next, await passwordContext(db, user));
  await db('users').where({ id: user_id }).update({ password_hash: await hashPassword(next), password_weak: false, updated_at: db.fn.now() });
  await logAuditEvent({ userId: String(user_id), action: 'password_changed', entityType: 'user', entityId: String(user_id), ipAddress: ip ?? null });
  return { ok: true };
}

export const publicUser = (u: UserRow) => ({ id: u.id, name: u.name, email: u.email, role: u.role, password_weak: !!u.password_weak });

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
  // The account's own details are checked before the link is used up, so a rejected password doesn't burn it.
  const open = await db('password_tokens').where({ token_hash: sha256(token) }).whereNull('used_at').where('expires_at', '>', new Date()).first();
  const owner = open && (await db('users').where({ id: open.user_id }).first());
  if (owner) assertStrongPassword(password, await passwordContext(db, owner));
  const password_hash = await hashPassword(password);
  const result = await db.transaction(async (trx) => {
    const row = await trx('password_tokens').where({ token_hash: sha256(token) }).whereNull('used_at').where('expires_at', '>', new Date()).first();
    if (!row) throw invalidToken();
    // Conditional claim: two submits of the same link can't both succeed.
    const claimed = await trx('password_tokens').where({ id: row.id }).whereNull('used_at').update({ used_at: new Date() });
    if (!claimed) throw invalidToken();
    const user = await trx('users').where({ id: row.user_id }).first();
    if (!user || !user.is_active) throw invalidToken();
    // A reset also lifts a lockout: the person has just proved they own the email.
    await trx('users').where({ id: user.id }).update({ password_hash, password_weak: false, failed_logins: 0, last_failed_login_at: null, locked_until: null, updated_at: trx.fn.now() });
    await trx('password_tokens').where({ user_id: user.id }).whereNull('used_at').update({ used_at: new Date() });
    return { user_id: Number(user.id), purpose: row.purpose as TokenPurpose };
  });
  await logAuditEvent({ userId: String(result.user_id), action: 'password_reset', entityType: 'user', entityId: String(result.user_id), metadata: { purpose: result.purpose }, ipAddress: ip ?? null });
  return { ok: true, purpose: result.purpose };
}
