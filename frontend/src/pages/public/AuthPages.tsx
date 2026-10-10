import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { ErrorBox, Field, PageTitle } from '@/components/ui';

export function LoginPage() {
  const { login } = useAuth(); const nav = useNavigate(); const loc = useLocation();
  const [f, setF] = useState({ email: '', password: '' }); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(null); try { await login(f.email, f.password); nav(loc.state?.from ?? '/me'); } catch (x) { setErr(x); } finally { setBusy(false); } };
  return (
    <form onSubmit={submit} className="card max-w-sm mx-auto space-y-3">
      <PageTitle title="Log in" />
      <Field label="Email"><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Password"><input className="input" type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      <ErrorBox error={err} />
      <button className="btn-primary w-full" disabled={busy}>Log in</button>
      <p className="text-xs text-slate-500 text-center">New here? <Link to="/register" className="text-indigo-600">Create an account</Link></p>
      <p className="text-xs text-slate-400 text-center">Demo: admin@ssa.test · treasurer@ssa.test · volunteer@ssa.test · member1@ssa.test / password123</p>
    </form>
  );
}

export function RegisterPage() {
  const { register } = useAuth(); const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '', student_id: '', phone: '' }); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(null); try { await register({ ...f, phone: f.phone || undefined, student_id: f.student_id || undefined }); nav('/me'); } catch (x) { setErr(x); } finally { setBusy(false); } };
  return (
    <form onSubmit={submit} className="card max-w-sm mx-auto space-y-3">
      <PageTitle title="Join SSA" sub="Create your account, then pay dues to activate membership." />
      <Field label="Full name"><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Email"><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Password (8+ chars)"><input className="input" type="password" minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      <Field label="Student ID"><input className="input" required value={f.student_id} onChange={(e) => setF({ ...f, student_id: e.target.value })} /></Field>
      <Field label="Phone (optional)"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      <ErrorBox error={err} />
      <button className="btn-primary w-full" disabled={busy}>Create account</button>
    </form>
  );
}
