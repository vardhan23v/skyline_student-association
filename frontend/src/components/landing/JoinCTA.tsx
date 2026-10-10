import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { join } from '../../data/landing';

type Fields = { name: string; email: string; student_id: string };
type Status = { kind: 'idle' } | { kind: 'error'; message: string } | { kind: 'success' };

const field = 'w-full rounded-full border border-ivory/20 bg-midnight/60 px-5 py-3.5 text-ivory placeholder:text-ivory/45 transition-colors focus:border-crimson focus:outline-none';

/**
 * Sign-up starter. The register API also needs a password, so this collects the first
 * three fields and hands them to /register to finish. They travel in router state
 * (not the URL), so names, emails and student IDs stay out of history and server logs.
 */
export function JoinCTA() {
  const nav = useNavigate();
  const [f, setF] = useState<Fields>({ name: '', email: '', student_id: '' });
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); if (status.kind === 'error') setStatus({ kind: 'idle' }); };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      const bad = form.querySelector<HTMLInputElement>(':invalid');
      setStatus({ kind: 'error', message: bad?.validationMessage ? `${bad.labels?.[0]?.textContent}: ${bad.validationMessage}` : 'Please check the form.' });
      bad?.focus();
      return;
    }
    setStatus({ kind: 'success' });
    setTimeout(() => nav('/register', { state: { prefill: f } }), 900);
  };

  return (
    <section id="join" tabIndex={-1} aria-labelledby="join-h" className="relative isolate overflow-hidden border-t border-ash/20 px-4 py-28 outline-none sm:py-36">
      <div aria-hidden="true" className="join-glow absolute inset-0 -z-10" />
      <div className="mx-auto max-w-3xl text-center">
        <h2 id="join-h">
          <span className="block font-script text-6xl leading-none text-ivory sm:text-7xl">{join.script}</span>
          <span className="mt-3 block text-[clamp(2.5rem,9vw,6rem)] font-extrabold uppercase leading-none tracking-[0.12em] text-ivory">{join.title}</span>
        </h2>
        <p className="mt-6 text-ivory/70">{join.benefits.join(' · ')}</p>

        {status.kind === 'success' ? (
          <motion.p role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto mt-12 flex max-w-md items-center justify-center gap-3 rounded-full border border-ivory/20 bg-midnight/60 px-6 py-4 font-medium text-ivory">
            <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-crimson" /> Nice, {f.name.split(' ')[0]}. Taking you to set a password…
          </motion.p>
        ) : (
          <form noValidate onSubmit={submit} className="mx-auto mt-12 grid max-w-3xl gap-3 sm:grid-cols-3" aria-describedby={status.kind === 'error' ? 'join-error' : undefined}>
            <label className="sr-only" htmlFor="join-name">Name</label>
            <input id="join-name" required maxLength={120} autoComplete="name" placeholder="Name" value={f.name} onChange={set('name')} className={field} />
            <label className="sr-only" htmlFor="join-email">Email</label>
            <input id="join-email" type="email" required maxLength={190} autoComplete="email" placeholder="Email" value={f.email} onChange={set('email')} className={field} />
            <label className="sr-only" htmlFor="join-sid">Student ID</label>
            <input id="join-sid" required maxLength={40} placeholder="Student ID" value={f.student_id} onChange={set('student_id')} className={field} />
            <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full bg-crimson px-8 py-4 font-bold text-ivory transition-[filter,transform] hover:brightness-110 active:scale-[0.98] sm:col-span-3 sm:mx-auto">
              Become a member <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
            {status.kind === 'error' && <p id="join-error" role="alert" className="text-sm font-medium text-ivory sm:col-span-3"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-crimson" />{status.message}</p>}
          </form>
        )}
      </div>
    </section>
  );
}
