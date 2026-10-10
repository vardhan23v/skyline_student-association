import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { destinationFor, safeNext, withParam } from '@/auth/redirect';
import { Button } from '@/components/Button';
import { LabeledInput } from '@/components/Input';
import { ErrorState } from '@/components/EmptyState';
import { SkylineMark } from '@/components/landing/SectionHeading';
import { backgrounds } from '@/data/backgrounds';

const hero = backgrounds[0];

/** Landing hero image + scrim behind the auth card. Standalone: no app nav, sidebar or dashboard header. */
function AuthBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="landing relative min-h-dvh overflow-hidden">
      <div className="fixed inset-0" aria-hidden>
        <picture>
          <source type="image/avif" srcSet={hero.picture.sources.avif} sizes="100vw" />
          <source type="image/webp" srcSet={hero.picture.sources.webp} sizes="100vw" />
          <img src={hero.picture.img.src} srcSet={hero.picture.sources.jpeg} sizes="100vw" alt="" width={hero.picture.img.w} height={hero.picture.img.h}
            className="h-full w-full object-cover" style={{ objectPosition: hero.focal, backgroundImage: `url(${hero.placeholder})`, backgroundSize: 'cover' }} />
        </picture>
        <div className="bg-scrim absolute inset-0" />
        <div className="absolute inset-0 bg-midnight" style={{ opacity: hero.overlay }} />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

/** Shown while /api/me resolves for a returning visitor: neutral, so no dashboard UI flashes before the redirect. */
function FullScreenLoader() {
  return (
    <AuthBackdrop>
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
        <Loader2 className="h-8 w-8 animate-spin text-cream/80" aria-hidden />
      </div>
    </AuthBackdrop>
  );
}

function AuthFrame({ title, sub, children, footer }: { title: string; sub?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <AuthBackdrop>
      <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-5 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 rounded-full text-cream" aria-label="Skyline Student Association home">
              <SkylineMark className="h-10 w-10" /><span className="t-nav font-extrabold">SSA</span>
            </Link>
            <Link to="/" className="t-nav inline-flex items-center gap-1.5 text-cream/75 transition-colors hover:text-cream"><ArrowLeft className="h-4 w-4" aria-hidden />Back to site</Link>
          </div>
          <div className="glass-l rounded-3xl p-6 backdrop-blur-xl md:p-8">
            <div className="mb-6"><h1 className="t-h3 text-cream">{title}</h1>{sub && <p className="mt-2 text-sm text-cream/70">{sub}</p>}</div>
            {children}
          </div>
          {footer && <div className="mt-4 text-center text-xs text-cream/60">{footer}</div>}
        </div>
      </main>
    </AuthBackdrop>
  );
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
  if (loading) return <FullScreenLoader />;
  if (me && !busy) return <Navigate to={destinationFor(me, next, action)} replace />;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const who = await login(f.email, f.password); nav(destinationFor(who, next, action), { replace: true }); }
    catch (x) { setErr(x); setBusy(false); }
  };
  return (
    <AuthFrame title="Welcome back" sub={action === 'register' ? 'Log in to register for the event.' : action === 'checkout' ? 'Log in to place your order.' : 'Log in to your SSA account.'}
      footer={<>Demo: admin@skyline.edu / Admin@123 · member@skyline.edu / Member@123 · student@skyline.edu / Student@123</>}>
      {expired && <p role="status" className="mb-4 rounded-xl border border-cream/20 bg-cream/10 px-3 py-2 text-sm text-cream">Your session expired, please log in again.</p>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <LabeledInput label="Email" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <LabeledInput label="Password" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <ErrorState error={err} />
        <Button type="submit" className="w-full" loading={busy}>Log in</Button>
        <p className="text-center text-sm text-cream/70">New here? <Link to={`/register${carry}`} className="text-cream underline underline-offset-4">Create an account</Link></p>
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
  if (loading) return <FullScreenLoader />;
  if (me && !busy) return <Navigate to={destinationFor(me, next, action)} replace />;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    // New sign-ups are always `user`: go to a valid next (resuming its action), else the account page.
    try { await register({ ...f, phone: f.phone || undefined, student_id: f.student_id || undefined }); nav(next ? (action ? withParam(next, 'action', action) : next) : '/me', { replace: true }); }
    catch (x) { setErr(x); setBusy(false); }
  };
  return (
    <AuthFrame title="Join SSA" sub="Create your account, then become a member to register for events.">
      <form onSubmit={submit} className="space-y-4">
        <LabeledInput label="Full name" autoComplete="name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <LabeledInput label="Email" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <LabeledInput label="Password" type="password" autoComplete="new-password" minLength={8} required hint="At least 8 characters." value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <LabeledInput label="Student ID" required value={f.student_id} onChange={(e) => setF({ ...f, student_id: e.target.value })} />
        <LabeledInput label="Phone (optional)" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <ErrorState error={err} />
        <Button type="submit" className="w-full" loading={busy}>Create account</Button>
        <p className="text-center text-sm text-cream/70">Already have an account? <Link to={`/login${carry}`} className="text-cream underline underline-offset-4">Log in</Link></p>
      </form>
    </AuthFrame>
  );
}
