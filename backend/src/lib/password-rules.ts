/**
 * The password rules, in one place. Pure (no Node APIs) so the frontend imports this same file for its live checklist;
 * the backend (lib/password.ts) is still the authority. `isCommon` is passed in because the 10,000-password list is
 * loaded differently on each side (a file on the server, a lazily loaded chunk in the browser).
 */
export const MIN_LENGTH = 10;
export const MAX_LENGTH = 128;
export const SPECIALS = '!@#$%^&*()-_=+[]{};:\'",.<>/?\\|`~';
const SPECIAL_RE = /[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/;

export type PasswordContext = { email?: string | null; name?: string | null; studentId?: string | null };
/** The six items of the visible checklist, then the rules that only show up when broken. */
export type RuleId = 'upper' | 'lower' | 'number' | 'special' | 'length' | 'common' | 'spaces' | 'digits' | 'repeat' | 'sequence' | 'personal' | 'max';
export type Check = { id: RuleId; label: string; ok: boolean; message: string };
export type PasswordResult = { ok: boolean; checks: Check[]; errors: string[]; strength: 'weak' | 'okay' | 'strong' };

/** Brand and default words that are only "common" when nothing but digits and symbols is added around them. */
const BASE_WORDS = ['skyline', 'ssa', 'password', 'admin'];
const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', '0123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/** Four or more consecutive characters of the alphabet, digits or a keyboard row, either direction (1234, dcba, qwer). */
export function hasSequence(pw: string, run = 4) {
  const s = pw.toLowerCase();
  for (const seq of SEQUENCES) for (const line of [seq, [...seq].reverse().join('')]) {
    for (let i = 0; i + run <= line.length; i++) if (s.includes(line.slice(i, i + run))) return true;
  }
  return false;
}

/** The common-word test both sides share: the exact list, the list word with digits/symbols around it, or a brand word. */
export function looksCommon(pw: string, inList: (lower: string) => boolean) {
  const lower = pw.toLowerCase();
  if (inList(lower)) return true;
  const core = lower.replace(/^[^a-z]+|[^a-z]+$/g, '');
  if (core.length >= 4 && inList(core)) return true;
  const letters = lower.replace(/[^a-z]/g, '');
  return BASE_WORDS.includes(letters);
}

/** Pieces of the person's own details worth refusing: the email name (and its longer parts), first name, student ID. */
function personalBits(ctx: PasswordContext) {
  const bits: { value: string; message: string }[] = [];
  const local = ctx.email?.split('@')[0]?.toLowerCase() ?? '';
  if (local.length >= 3) bits.push({ value: local, message: "Don't use your email name" });
  for (const part of local.split(/[^a-z]+/)) if (part.length >= 4 && part !== local) bits.push({ value: part, message: "Don't use your email name" });
  const first = ctx.name?.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (first.length >= 3) bits.push({ value: first, message: "Don't use your name" });
  const sid = ctx.studentId?.trim().toLowerCase() ?? '';
  if (sid.length >= 3) bits.push({ value: sid, message: "Don't use your student ID" });
  return bits;
}

export function checkPassword(pw: string, ctx: PasswordContext = {}, inList: (lower: string) => boolean = () => false): PasswordResult {
  const lower = pw.toLowerCase();
  const personal = personalBits(ctx).find((b) => lower.includes(b.value));
  const checks: Check[] = [
    { id: 'upper', label: 'Uppercase', ok: /[A-Z]/.test(pw), message: 'Add an uppercase letter' },
    { id: 'lower', label: 'Lowercase', ok: /[a-z]/.test(pw), message: 'Add a lowercase letter' },
    { id: 'number', label: 'Number', ok: /\d/.test(pw), message: 'Add a number' },
    { id: 'special', label: 'Special character', ok: SPECIAL_RE.test(pw), message: 'Add a special character' },
    { id: 'length', label: `${MIN_LENGTH}+ characters`, ok: pw.length >= MIN_LENGTH, message: `Use at least ${MIN_LENGTH} characters` },
    { id: 'common', label: 'Not common', ok: pw.length > 0 && !looksCommon(pw, inList), message: 'Too common, choose something less predictable' },
    { id: 'max', label: `At most ${MAX_LENGTH} characters`, ok: pw.length <= MAX_LENGTH, message: `Use at most ${MAX_LENGTH} characters` },
    { id: 'spaces', label: 'No spaces at the ends', ok: pw === pw.trim(), message: 'Remove spaces at the start or end' },
    { id: 'digits', label: 'Not only numbers', ok: !/^\d+$/.test(pw), message: "Don't use only numbers" },
    { id: 'repeat', label: 'Not one repeated character', ok: !/^(.)\1*$/s.test(pw), message: "Don't repeat a single character" },
    { id: 'sequence', label: 'No sequences', ok: !hasSequence(pw), message: 'Avoid sequences like 1234, abcd or qwer' },
    { id: 'personal', label: 'Nothing personal', ok: !personal, message: personal?.message ?? "Don't use your own details" },
  ];
  const errors = checks.filter((c) => !c.ok).map((c) => c.message);
  const ok = errors.length === 0;
  const kinds = [/[A-Z]/, /[a-z]/, /\d/, SPECIAL_RE].filter((r) => r.test(pw)).length;
  const strength = !ok ? 'weak' : pw.length >= 14 && kinds === 4 ? 'strong' : 'okay';
  return { ok, checks, errors, strength };
}
