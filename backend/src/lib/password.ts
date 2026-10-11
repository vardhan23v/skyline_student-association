import { readFileSync } from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import type { RefinementCtx } from 'zod';
import { HttpError } from './errors';
import { checkPassword, MAX_LENGTH, type PasswordContext } from './password-rules';

/**
 * The 10,000 most common passwords (SecLists, MIT licence; see backend/data/README.md), lower-cased. src/lib and
 * dist/lib sit at the same depth, so the same relative path works from source and from the build.
 */
const COMMON = new Set(readFileSync(path.resolve(__dirname, '../../data/common-passwords.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean));
export const isCommonPassword = (lower: string) => COMMON.has(lower);

/** Every password that is set or changed goes through this. Existing passwords are only checked at login (to flag them). */
export function validatePassword(pw: string, ctx: PasswordContext = {}) {
  const r = checkPassword(pw, ctx, isCommonPassword);
  return { ok: r.ok, errors: r.errors };
}

/** 400 WEAK_PASSWORD with the human-readable reasons, for checks that need the account (e.g. a reset link's user). */
export const weakPassword = (errors: string[]) => new HttpError(400, 'Choose a stronger password', 'WEAK_PASSWORD', undefined, { errors });
export function assertStrongPassword(pw: string, ctx: PasswordContext = {}) {
  const r = validatePassword(pw, ctx);
  if (!r.ok) throw weakPassword(r.errors);
}

/**
 * zod refinement: adds one issue per broken rule, tagged so the validate middleware answers 400 WEAK_PASSWORD with
 * `errors` instead of a generic BAD_REQUEST. `ctx` reads the person's details from the same body when it has them.
 */
export const WEAK_PASSWORD_ISSUE = 'weak_password';
export function refinePassword(pw: string, z: RefinementCtx, ctx: PasswordContext = {}, field: (string | number)[] = []) {
  for (const message of validatePassword(pw, ctx).errors) z.addIssue({ code: 'custom', message, path: field, params: { [WEAK_PASSWORD_ISSUE]: true } });
}
export { MAX_LENGTH as MAX_PASSWORD_LENGTH };

/** bcrypt cost: 12 in production; tests run at 4 (BCRYPT_ROUNDS overrides both). Logins rehash hashes below this. */
export const bcryptRounds = () => Number(process.env.BCRYPT_ROUNDS) || (process.env.NODE_ENV === 'test' ? 4 : 12);
export const hashPassword = (pw: string) => bcrypt.hash(pw, bcryptRounds());
export const needsRehash = (hash: string) => { try { return bcrypt.getRounds(hash) < bcryptRounds(); } catch { return false; } };
