import { useEffect, useMemo, useState } from 'react';
import { checkPassword, type PasswordContext, type PasswordResult } from '../../../backend/src/lib/password-rules';

/**
 * The live checklist runs the backend's own rules file (one source of truth); the server still decides. The 10,000
 * common passwords (~70 KB) load as a separate chunk the first time a password form opens, never on other pages.
 */
let common: Set<string> | null = null;
let loading: Promise<Set<string>> | null = null;
export function loadCommonPasswords() {
  loading ??= import('../../../backend/data/common-passwords.txt?raw').then((m) => (common = new Set(m.default.split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean))));
  return loading;
}

export const checkNewPassword = (pw: string, ctx: PasswordContext = {}): PasswordResult => checkPassword(pw, ctx, (lower) => common?.has(lower) ?? false);

/** The checklist result for the field's current value; re-checks once the common list has loaded. */
export function usePasswordCheck(pw: string, ctx: PasswordContext = {}) {
  const [ready, setReady] = useState(!!common);
  useEffect(() => { if (!common) void loadCommonPasswords().then(() => setReady(true)).catch(() => {}); }, []);
  return useMemo(() => checkNewPassword(pw, ctx), [pw, ctx.email, ctx.name, ctx.studentId, ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
export type { PasswordContext, PasswordResult };
