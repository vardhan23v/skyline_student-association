import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { LabeledInput } from '@/components/Input';
import { ErrorState } from '@/components/EmptyState';

function AuthFrame({ title, sub, children, footer }: { title: string; sub?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="mx-auto mt-4 max-w-md md:mt-10">
      <div className="card glow-horizon p-6 md:p-8">
        <div className="mb-6"><div className="t-label mb-2">Skyline Student Association</div><h1 className="t-title">{title}</h1>{sub && <p className="mt-1.5 text-sm text-text-secondary">{sub}</p>}</div>
        {children}
      </div>
      {footer && <div className="mt-4 text-center t-caption">{footer}</div>}
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth(); const nav = useNavigate(); const loc = useLocation();
  const [f, setF] = useState({ email: '', password: '' }); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(null); try { await login(f.email, f.password); nav(loc.state?.from ?? '/dashboard', { replace: true }); } catch (x) { setErr(x); } finally { setBusy(false); } };
  return (
    <AuthFrame title="Welcome back" sub="Log in to your member portal." footer={<>Demo accounts: admin@ssa.test · treasurer@ssa.test · volunteer@ssa.test · member1@ssa.test (password123)</>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <LabeledInput label="Email" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <LabeledInput label="Password" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <ErrorState error={err} />
        <Button type="submit" className="w-full" loading={busy}>Log in</Button>
        <p className="text-center t-caption">New here? <Link to="/register" className="text-accent">Create an account</Link></p>
      </form>
    </AuthFrame>
  );
}

export function RegisterPage() {
  const { register } = useAuth(); const nav = useNavigate();
  // Prefill from the landing page join form (router state), or from ?name=&email=&student_id= links.
  const { state } = useLocation(); const [params] = useSearchParams();
  const pre = (state as { prefill?: Record<string, string> } | null)?.prefill ?? {};
  const pick = (k: string) => (pre[k] ?? params.get(k) ?? '').slice(0, 190);
  const [f, setF] = useState({ name: pick('name'), email: pick('email'), password: '', student_id: pick('student_id'), phone: '' }); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(null); try { await register({ ...f, phone: f.phone || undefined, student_id: f.student_id || undefined }); nav('/me', { replace: true }); } catch (x) { setErr(x); } finally { setBusy(false); } };
  return (
    <AuthFrame title="Join SSA" sub="Create your account, then pay dues to activate membership.">
      <form onSubmit={submit} className="space-y-4">
        <LabeledInput label="Full name" autoComplete="name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <LabeledInput label="Email" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <LabeledInput label="Password" type="password" autoComplete="new-password" minLength={8} required hint="At least 8 characters." value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <LabeledInput label="Student ID" required value={f.student_id} onChange={(e) => setF({ ...f, student_id: e.target.value })} />
        <LabeledInput label="Phone (optional)" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <ErrorState error={err} />
        <Button type="submit" className="w-full" loading={busy}>Create account</Button>
        <p className="text-center t-caption">Already a member? <Link to="/login" className="text-accent">Log in</Link></p>
      </form>
    </AuthFrame>
  );
}
