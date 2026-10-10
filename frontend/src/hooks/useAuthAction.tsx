import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { isMembershipRequired } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { loginUrl } from '@/auth/redirect';
import { MembershipCard } from '@/components/MembershipCard';

type Opts = {
  /** Open the membership card first when the user isn't a member (the API is checked anyway). */
  requireMember?: boolean;
  /** Name of this action in the URL (`?action=register`), so it can resume after the login round-trip. */
  resume?: string;
  /** Shown on the membership card. */
  reason?: string;
};
type Pending = { run: () => Promise<unknown>; reason?: string };

/**
 * Gate an action behind login and, optionally, membership, and resume it afterwards.
 *
 * - Signed out: go to `/login?next=<this page>&action=<resume>`. After login the user comes back with
 *   `?action=<resume>` and `onResume(resume)` fires once (the param is then removed from the URL).
 * - Signed in, not a member (or the API answers 403 MEMBERSHIP_REQUIRED): open the MembershipCard. When the
 *   membership is paid, `/me` is refetched and the same action runs again automatically.
 *
 * Render the returned `card` once in the page.
 */
export function useAuthAction({ onResume }: { onResume?: (action: string) => void } = {}) {
  const { me, refreshMe } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const [pending, setPending] = useState<Pending | null>(null);

  const here = useCallback(() => {
    const p = new URLSearchParams(loc.search); p.delete('action');
    const qs = p.toString();
    return `${loc.pathname}${qs ? `?${qs}` : ''}`;
  }, [loc.pathname, loc.search]);

  const runProtected = useCallback(async (action: () => Promise<unknown>, opts: Opts = {}) => {
    if (!me) { nav(loginUrl(here(), opts.resume)); return; }
    if (opts.requireMember && !me.is_member) { setPending({ run: action, reason: opts.reason }); return; }
    try { return await action(); }
    catch (e) {
      if (isMembershipRequired(e)) { setPending({ run: action, reason: opts.reason }); return; }
      throw e;
    }
  }, [me, nav, here]);

  // Back from /login with ?action=…: strip it (so a reload doesn't repeat it) and resume once.
  const resumeRef = useRef(onResume); resumeRef.current = onResume;
  const resumed = useRef<string | null>(null);
  useEffect(() => {
    const action = new URLSearchParams(loc.search).get('action');
    if (!me || !action || resumed.current === action) return;
    resumed.current = action;
    nav(here(), { replace: true });
    resumeRef.current?.(action);
  }, [me, loc.search, nav, here]);

  const onPaid = async () => {
    const p = pending;
    setPending(null);
    await refreshMe();
    qc.invalidateQueries();
    // The action reports its own errors (mutation state / toasts); a failure here must not be an unhandled rejection.
    if (p) await p.run().catch(() => {});
  };

  const card = <MembershipCard open={!!pending} reason={pending?.reason} onClose={() => setPending(null)} onPaid={onPaid} />;
  return { runProtected, card, me };
}
