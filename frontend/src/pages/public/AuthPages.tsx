import { useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/api/client';
import { destinationFor, safeNext, withParam } from '@/auth/redirect';
import { Button } from '@/components/Button';
import { LabeledInput } from '@/components/Input';
import { ErrorState } from '@/components/EmptyState';
import { SectionHeading, SkylineMark } from '@/components/landing/SectionHeading';
import { BackgroundStage } from '@/components/landing/BackgroundStage';
import { StudentCursor } from '@/components/cursor/StudentCursor';
import { MotionConfig, motion } from 'framer-motion';

/** Landing hero image (BackgroundStage `still`) behind the auth card, plus the student cursor. No app chrome. */
function AuthBackdrop({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="landing relative min-h-[100svh] overflow-hidden">
        <BackgroundStage variant="still" />
        <div className="relative z-[1]">{children}</div>
        <StudentCursor />
      </div>
    </MotionConfig>
  );
}

/** Shown while /api/me resolves for a returning visitor: neutral, so no dashboard UI flashes before the redirect. */
function FullScreenLoader() {
  return (
    <AuthBackdrop>
      <div className="flex min-h-[100svh] items-center justify-center" role="status" aria-label="Loading">
        <Loader2 className="h-8 w-8 animate-spin text-cream/80" aria-hidden />
      </div>
    </AuthBackdrop>
  );
}

function AuthFrame({ script, title, sub, children, footer }: { script: string; title: string; sub?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <AuthBackdrop>
      {/* Full width with a 16px gutter on phones, max-w-md from sm; vertically centred. No fixed-bottom elements, so the
          on-screen keyboard never covers the submit button. */}
      <main className="flex min-h-[100svh] flex-col items-center justify-center px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
        <motion.div className="w-full max-w-md" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
          <div className="mb-5 flex items-center justify-between">
            <Link to="/" className="flex min-h-11 items-center gap-2 rounded-full text-cream">
              <SkylineMark className="h-10 w-10" /><span className="t-nav font-extrabold">SSA<span className="sr-only"> home, Skyline Student Association</span></span>
            </Link>
            <Link to="/" className="t-nav inline-flex min-h-11 items-center gap-1.5 text-cream/75 transition-colors hover:text-cream"><ArrowLeft className="h-4 w-4" aria-hidden />Back to site</Link>
          </div>
          <div className="glass rounded-2xl p-5 sm:p-6 md:p-8">
            <div className="mb-6"><SectionHeading as="h1" size="md" script={script} title={title} />{sub && <p className="mt-3 text-sm text-cream/70">{sub}</p>}</div>
            {children}
          </div>
          {footer && <div className="mt-4 text-center text-xs text-cream/70">{footer}</div>}
        </motion.div>
      </main>
    </AuthBackdrop>
  );
}

type Errors = Partial<Record<string, string>>;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Server field errors (400 VALIDATION) mapped onto the form's fields; anything else stays a form-level error. */
function fieldErrors(e: unknown): Errors {
  const f = e instanceof ApiError ? (e.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors : undefined;
  return f ? Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v[0]])) : {};
}
/** Focus the first field with an error, so the keyboard opens on it and screen readers land there. */
function focusFirst(form: HTMLFormElement | null, errs: Errors) {
  const k = Object.keys(errs).find((x) => errs[x]);
  if (k) form?.querySelector<HTMLElement>(`[name="${k}"]`)?.focus();
}

/** next/action from the URL, validated. `action` only rides along with a valid next. */
function useNextParams() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const action = next ? params.get('action') : null;
  const carry = new URLSearchParams({ ...(next ? { next } : {}), ...(action ? { action } : {}) }).toString();
  return { next, action, carry: carry ? `?${carry}` : '', expired: params.get('expired') === '1' };
}

export function LoginPage() {
  const { me, loading, login } = useAuth(); const nav = useNavigate();
  const { next, action, carry, expired } = useNextParams();
  const [f, setF] = useState({ email: '', password: '' }); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Errors>({});
  const form = useRef<HTMLFormElement>(null);
  if (loading) return <FullScreenLoader />;
  if (me && !busy) return <Navigate to={destinationFor(me, next, action)} replace />;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); if (errs[k]) setErrs({ ...errs, [k]: undefined }); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v: Errors = { email: !f.email.trim() ? 'Enter your email.' : !EMAIL.test(f.email.trim()) ? 'Enter a valid email, like name@college.edu.' : undefined, password: !f.password ? 'Enter your password.' : undefined };
    setErrs(v); if (v.email || v.password) { setErr(null); return focusFirst(form.current, v); }
    setBusy(true); setErr(null);
    try { const who = await login(f.email.trim(), f.password); nav(destinationFor(who, next, action), { replace: true }); }
    catch (x) { const fe = fieldErrors(x); setErrs(fe); setErr(Object.keys(fe).length ? null : x); setBusy(false); focusFirst(form.current, fe); }
  };
  return (
    <AuthFrame script="welcome" title="Back" sub={action === 'register' ? 'Log in to register for the event.' : action === 'checkout' ? 'Log in to place your order.' : 'Log in to your SSA account.'}
      footer={<>Demo: admin@skyline.edu / Admin@123 · member@skyline.edu / Member@123 · student@skyline.edu / Student@123</>}>
      {expired && <p role="status" className="mb-4 rounded-xl border border-cream/20 bg-cream/10 px-3 py-2 text-sm text-cream">Your session expired, please log in again.</p>}
      <form ref={form} onSubmit={submit} className="space-y-4" noValidate>
        <LabeledInput label="Email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" required value={f.email} onChange={set('email')} error={errs.email} />
        <LabeledInput label="Password" name="password" type="password" autoComplete="current-password" enterKeyHint="go" required value={f.password} onChange={set('password')} error={errs.password} />
        <ErrorState error={err} />
        <Button type="submit" className="w-full !min-h-12" loading={busy}>Log in</Button>
        <p className="text-center text-sm text-cream/70">New here? <Link to={`/register${carry}`} className="inline-flex min-h-11 items-center text-cream underline underline-offset-4">Create an account</Link></p>
      </form>
    </AuthFrame>
  );
}

export function RegisterPage() {
  const { me, loading, register } = useAuth(); const nav = useNavigate();
  const { next, action, carry } = useNextParams();
  // Prefill from the landing page join form (router state), or from ?name=&email=&student_id= links.
  const { state } = useLocation(); const [params] = useSearchParams();
  const pre = (state as { prefill?: Record<string, string> } | null)?.prefill ?? {};
  const pick = (k: string) => (pre[k] ?? params.get(k) ?? '').slice(0, 190);
  const [f, setF] = useState({ name: pick('name'), email: pick('email'), password: '', student_id: pick('student_id'), phone: '' }); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Errors>({});
  const form = useRef<HTMLFormElement>(null);
  if (loading) return <FullScreenLoader />;
  if (me && !busy) return <Navigate to={destinationFor(me, next, action)} replace />;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); if (errs[k]) setErrs({ ...errs, [k]: undefined }); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v: Errors = {
      name: !f.name.trim() ? 'Enter your full name.' : undefined,
      email: !f.email.trim() ? 'Enter your email.' : !EMAIL.test(f.email.trim()) ? 'Enter a valid email, like name@college.edu.' : undefined,
      password: f.password.length < 8 ? 'Use at least 8 characters.' : undefined,
      student_id: !f.student_id.trim() ? 'Enter your student ID.' : undefined,
    };
    setErrs(v); if (Object.values(v).some(Boolean)) { setErr(null); return focusFirst(form.current, v); }
    setBusy(true); setErr(null);
    // New sign-ups are always `user`: go to a valid next (resuming its action), else the account page.
    try { await register({ ...f, email: f.email.trim(), phone: f.phone || undefined, student_id: f.student_id.trim() || undefined }); nav(next ? (action ? withParam(next, 'action', action) : next) : '/me', { replace: true }); }
    catch (x) { const fe = fieldErrors(x); setErrs(fe); setErr(Object.keys(fe).length ? null : x); setBusy(false); focusFirst(form.current, fe); }
  };
  return (
    <AuthFrame script="join" title="SSA" sub="Create your account, then become a member to register for events.">
      <form ref={form} onSubmit={submit} className="space-y-4" noValidate>
        <LabeledInput label="Full name" name="name" autoComplete="name" autoCapitalize="words" enterKeyHint="next" required value={f.name} onChange={set('name')} error={errs.name} />
        <LabeledInput label="Email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" required value={f.email} onChange={set('email')} error={errs.email} />
        <LabeledInput label="Password" name="password" type="password" autoComplete="new-password" minLength={8} enterKeyHint="next" required hint="At least 8 characters." value={f.password} onChange={set('password')} error={errs.password} />
        {/* Letters + digits (SKY2026001): text keyboard with capitals, not a numeric pad. */}
        <LabeledInput label="Student ID" name="student_id" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="next" required value={f.student_id} onChange={set('student_id')} error={errs.student_id} />
        <LabeledInput label="Phone (optional)" name="phone" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="go" value={f.phone} onChange={set('phone')} error={errs.phone} />
        <ErrorState error={err} />
        <Button type="submit" className="w-full !min-h-12" loading={busy}>Create account</Button>
        <p className="text-center text-sm text-cream/70">Already have an account? <Link to={`/login${carry}`} className="inline-flex min-h-11 items-center px-1.5 text-cream underline underline-offset-4">Log in</Link></p>
      </form>
    </AuthFrame>
  );
}
