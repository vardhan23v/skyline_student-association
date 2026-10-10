import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { ApiError, post } from '@/api/client';
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
  const [params, setParams] = useSearchParams();
  const forgot = params.get('forgot') === '1';
  const [f, setF] = useState({ email: '', password: '' }); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Errors>({});
  const form = useRef<HTMLFormElement>(null);
  if (loading) return <FullScreenLoader />;
  if (me && !busy) return <Navigate to={destinationFor(me, next, action)} replace />;
  // `?forgot=1` swaps the card for the forgot-password form (Back returns to login); the email typed so far carries over.
  if (forgot) return <ForgotPasswordCard email={f.email} onBack={() => { params.delete('forgot'); setParams(params); }} />;
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
        <div className="-mt-2 text-right"><button type="button" onClick={() => { params.set('forgot', '1'); setParams(params); }} className="inline-flex min-h-11 items-center text-sm text-cream/80 underline underline-offset-4 hover:text-cream">Forgot password?</button></div>
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

/** Forgot password: one email field, then the same neutral message whether or not the account exists. */
function ForgotPasswordCard({ email: initial, onBack }: { email: string; onBack: () => void }) {
  const [email, setEmail] = useState(initial); const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null); const [sent, setSent] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = !email.trim() ? 'Enter your email.' : !EMAIL.test(email.trim()) ? 'Enter a valid email, like name@college.edu.' : undefined;
    setError(v); if (v) return;
    setBusy(true); setErr(null);
    try { setSent((await post<{ message: string }>('/auth/forgot-password', { email: email.trim() })).message); }
    catch (x) { setErr(x); } finally { setBusy(false); }
  };
  return (
    <AuthFrame script="forgot" title="Password" sub={sent ? undefined : "Enter your account's email and we'll send you a link to choose a new password."}>
      {sent ? (
        <div className="space-y-4">
          <p role="status" className="flex items-start gap-2 rounded-xl border border-cream/20 bg-cream/10 px-3 py-3 text-sm text-cream"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{sent}</p>
          <p className="text-sm text-cream/70">Check your spam folder too. The link works once.</p>
          <Button type="button" variant="secondary" className="w-full !min-h-12" onClick={onBack}>Back to log in</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <LabeledInput label="Email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="send" required autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setError(undefined); }} error={error} />
          <ErrorState error={err} />
          <Button type="submit" className="w-full !min-h-12" loading={busy}>Send reset link</Button>
          <p className="text-center text-sm text-cream/70"><button type="button" onClick={onBack} className="inline-flex min-h-11 items-center text-cream underline underline-offset-4">Back to log in</button></p>
        </form>
      )}
    </AuthFrame>
  );
}

/**
 * /reset-password?token=… — choose a new password from an emailed link. `&setup=1` (accounts an admin created) titles
 * it "set your password". On success: a confirmation, then /login.
 */
export function ResetPasswordPage() {
  const nav = useNavigate(); const [params] = useSearchParams();
  const token = params.get('token') ?? ''; const setup = params.get('setup') === '1';
  const [f, setF] = useState({ password: '', confirm: '' }); const [errs, setErrs] = useState<Errors>({});
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null); const [done, setDone] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (!done) return; const t = setTimeout(() => nav('/login', { replace: true }), 2500); return () => clearTimeout(t); }, [done, nav]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); if (errs[k]) setErrs({ ...errs, [k]: undefined }); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v: Errors = {
      password: f.password.length < 8 ? 'Use at least 8 characters.' : !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password) ? 'Include at least one letter and one number.' : undefined,
      confirm: f.confirm !== f.password ? "The passwords don't match." : undefined,
    };
    setErrs(v); if (v.password || v.confirm) { setErr(null); return focusFirst(form.current, v); }
    setBusy(true); setErr(null);
    try { await post('/auth/reset-password', { token, password: f.password }); setDone(true); }
    catch (x) { const fe = fieldErrors(x); setErrs(fe); setErr(Object.keys(fe).length ? null : x); focusFirst(form.current, fe); }
    finally { setBusy(false); }
  };
  const title = setup ? { script: 'set your', title: 'Password' } : { script: 'reset your', title: 'Password' };
  if (!token) return (
    <AuthFrame {...title} sub="This link is missing its token.">
      <Link to="/login?forgot=1" className="btn-primary w-full !min-h-12">Request a new link</Link>
    </AuthFrame>
  );
  return (
    <AuthFrame {...title} sub={done ? undefined : setup ? 'Choose a password for your SSA account.' : 'Choose a new password for your SSA account.'}>
      {done ? (
        <div className="space-y-4">
          <p role="status" className="flex items-start gap-2 rounded-xl border border-cream/20 bg-cream/10 px-3 py-3 text-sm text-cream"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Password {setup ? 'set' : 'changed'}. Taking you to log in…</p>
          <Link to="/login" replace className="btn-primary w-full !min-h-12">Log in now</Link>
        </div>
      ) : (
        <form ref={form} onSubmit={submit} className="space-y-4" noValidate>
          <LabeledInput label="New password" name="password" type="password" autoComplete="new-password" minLength={8} enterKeyHint="next" required autoFocus hint="At least 8 characters, with a letter and a number." value={f.password} onChange={set('password')} error={errs.password} />
          <LabeledInput label="Confirm password" name="confirm" type="password" autoComplete="new-password" enterKeyHint="go" required value={f.confirm} onChange={set('confirm')} error={errs.confirm} />
          <ErrorState error={err} />
          {err instanceof ApiError && err.code === 'INVALID_TOKEN' && <Link to="/login?forgot=1" className="inline-flex min-h-11 items-center text-sm text-cream underline underline-offset-4">Request a new link</Link>}
          <Button type="submit" className="w-full !min-h-12" loading={busy}>{setup ? 'Set password' : 'Change password'}</Button>
        </form>
      )}
    </AuthFrame>
  );
}
