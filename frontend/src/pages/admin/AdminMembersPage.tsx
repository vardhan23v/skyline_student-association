import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, CalendarClock, CheckCircle2, Mail, QrCode, Search, UserPlus, UserRound, Wallet } from 'lucide-react';
import { get, patch, post } from '@/api/client';
import type { DuesRow, Member, MembershipOffer } from '@/api/types';
import { Button } from '@/components/Button';
import { LabeledInput } from '@/components/Input';
import { useToast } from '@/components/Toast';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { Input, Select } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { date, money } from '@/components/format';

/** Dues for the latest period, as shown in the directory: paid (how and when), awaiting payment, or none. */
function DuesCell({ m }: { m: Member }) {
  if (!m.dues_status) return <span className="t-caption">No dues</span>;
  if (m.dues_status !== 'paid') return <StatusBadge status="pending">{m.dues_status === 'pending' ? 'unpaid' : m.dues_status}</StatusBadge>;
  return <span className="whitespace-nowrap"><span className="t-num font-medium">{money(m.dues_amount)}</span><span className="block t-caption">{m.dues_provider === 'cash' ? 'cash' : 'online'}{m.dues_paid_at ? ` · ${date(m.dues_paid_at)}` : ''}</span></span>;
}

/** Admin › Members: searchable directory with dues status. The drawer shows dues history, records cash dues (add or
 *  extend), sets the expiry date and sends a renewal reminder. */
export function AdminMembersPage() {
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ q: '', status: '', expiring: false });
  const [walkIn, setWalkIn] = useState(false);
  const [added, setAdded] = useState<number | null>(null); // the walk-in just signed up, pinned to the top of the list
  const [open, setOpen] = useState<Member | null>(null);
  const [dues, setDues] = useState({ amount: '500', expiry_date: '' });
  const [expiry, setExpiry] = useState('');
  const show = (m: Member | null) => { cash.reset(); setExp.reset(); remind.reset(); setDues({ amount: '500', expiry_date: '' }); setExpiry(m?.expiry_date ? String(m.expiry_date).slice(0, 10) : ''); setOpen(m); };
  const refresh = () => { qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['admin', 'overview'] }); };
  const history = useQuery({ queryKey: ['members', open?.id, 'dues'], queryFn: () => get<DuesRow[]>(`/admin/members/${open!.id}/dues`), enabled: !!open });
  const setExp = useMutation({
    mutationFn: (m: Member) => patch(`/admin/members/${m.id}/membership`, { expiry_date: expiry }),
    onSuccess: () => { refresh(); toast.success('Expiry updated', `Membership now runs until ${date(expiry)}.`); setOpen(null); },
  });
  const remind = useMutation({
    mutationFn: (m: Member) => post<{ sent: boolean; email: string }>(`/admin/members/${m.id}/remind`),
    onSuccess: (r) => toast.success(r.sent ? 'Reminder sent' : 'Reminder queued', `Renewal email to ${r.email}.`),
    onError: (e: Error) => toast.error('Could not send the reminder', e.message),
  });
  const cash = useMutation({
    mutationFn: (m: Member) => post<{ expiry_date: string; extended: boolean }>(`/admin/members/${m.id}/cash-payment`, { amount: Number(dues.amount), expiry_date: dues.expiry_date || undefined }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['admin', 'overview'] }); toast.success(r.extended ? 'Membership extended' : 'Membership activated', `Active until ${date(r.expiry_date)}. Ledger entry written.`); setOpen(null); },
  });
  const qs = new URLSearchParams({ ...(f.q ? { q: f.q } : {}), ...(f.status ? { status: f.status } : {}), ...(f.expiring ? { expiring_within_days: '14' } : {}) }).toString();
  // Keep the previous rows while a new search loads, so the table doesn't flash a skeleton on every keystroke.
  const q = useQuery({ queryKey: ['members', qs], queryFn: () => get<Member[]>(`/admin/members?${qs}`), placeholderData: (prev) => prev });
  const rows = added && q.data ? [...q.data].sort((a, b) => Number(b.id === added) - Number(a.id === added)) : q.data;
  const days = (d: string | null) => d ? Math.ceil((+new Date(d) - Date.now()) / 86_400_000) : null;
  return (
    <>
      <PageHeader script="member" title="Directory" description="Membership status and expiry for every profile. Open a member to record cash dues."
        actions={<><span className="t-label">{q.data?.length ?? 0} shown</span><Button onClick={() => setWalkIn(true)} icon={<UserPlus className="size-4" aria-hidden />}>New member at table</Button></>} />
      <div className="card mb-4 flex flex-wrap items-center gap-2 !p-3 sm:!py-3" role="search">
        <div className="relative w-full min-w-56 flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" aria-hidden /><label htmlFor="mq" className="sr-only">Search members</label><Input id="mq" type="search" enterKeyHint="search" className="!pl-10" placeholder="Name, email or student ID" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <label htmlFor="ms" className="sr-only">Membership status</label>
        <Select id="ms" className="!w-auto flex-1 sm:flex-none" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Any status</option><option value="active">Active</option><option value="expired">Expired</option><option value="pending">Pending</option><option value="none">No membership</option></Select>
        <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-border-strong px-4 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={f.expiring} onChange={(e) => setF({ ...f, expiring: e.target.checked })} />Expiring in 14 days</label>
      </div>
      <DataTable rows={rows} loading={q.isLoading} rowClassName={(m) => (m.id === added ? '!bg-accent-soft' : '')} error={q.error} onRetry={() => q.refetch()} rowKey={(m) => m.id} caption="Members" empty={<EmptyState icon={<UserRound className="size-5" aria-hidden />} title="No members match" description="Try a different search or clear the filters." />}
        columns={[
          { key: 'name', header: 'Name', mobile: 'primary', render: (m) => <button onClick={() => show(m)} className="-my-1 inline-flex min-h-11 flex-col justify-center text-left font-medium hover:text-accent-text focus-ring rounded">{m.name}<span className="block t-caption font-mono md:hidden">{m.student_id}</span></button> },
          { key: 'sid', header: 'Student ID', render: (m) => <span className="font-mono text-xs">{m.student_id}</span>, hideOnMobile: true },
          { key: 'email', header: 'Email', render: (m) => <span className="text-text-secondary">{m.email}</span>, hideOnMobile: true },
          { key: 'status', header: 'Membership', mobile: 'status', render: (m) => <StatusBadge status={m.membership_status} /> },
          { key: 'exp', header: 'Expires', render: (m) => { const d = days(m.expiry_date); return <span className={d != null && d <= 14 && d >= 0 ? 'text-warning' : ''}>{date(m.expiry_date)}{d != null && d >= 0 && d <= 14 && <span className="block t-caption">in {d}d</span>}</span>; } },
          { key: 'dues', header: 'Dues', render: (m) => <DuesCell m={m} /> },
          { key: 'joined', header: 'Joined', render: (m) => date(m.joined_at), hideOnMobile: true },
        ]} />
      <WalkInModal open={walkIn} onClose={() => setWalkIn(false)} onAdded={(id) => { setAdded(id); refresh(); }} />
      <Modal open={!!open} onClose={() => show(null)} variant="drawer" title={open?.name ?? ''} description={open?.email}
        footer={<><Button variant="secondary" onClick={() => show(null)}>Close</Button><Button form="dues-form" type="submit" loading={cash.isPending} icon={<Wallet className="size-4" aria-hidden />}>{open?.membership_status === 'active' ? 'Extend' : 'Activate'} · {money(dues.amount)} cash</Button></>}>
        {open && (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="t-label">Student ID</dt><dd className="mt-0.5 font-mono">{open.student_id}</dd></div>
            <div><dt className="t-label">Role</dt><dd className="mt-0.5 capitalize">{open.role}</dd></div>
            <div><dt className="t-label">Phone</dt><dd className="mt-0.5">{open.phone || '—'}</dd></div>
            <div><dt className="t-label">Joined</dt><dd className="mt-0.5">{date(open.joined_at)}</dd></div>
            <div><dt className="t-label">Membership</dt><dd className="mt-1"><StatusBadge status={open.membership_status} /></dd></div>
            <div><dt className="t-label">Expires</dt><dd className="mt-0.5">{date(open.expiry_date)}</dd></div>
          </dl>
        )}
        {open && (
          <section className="mt-6 border-t border-border pt-5" aria-labelledby="dues-h">
            <h3 id="dues-h" className="t-section">Dues history</h3>
            {history.isLoading ? <p className="t-caption mt-2">Loading…</p> : !history.data?.length ? <p className="t-caption mt-2">No dues recorded yet.</p> : (
              <ul className="mt-2 divide-y divide-border text-sm">
                {history.data.map((d) => (
                  <li key={d.membership_id} className="flex items-start justify-between gap-3 py-2">
                    <span><span className="block">{date(d.start_date)} – {date(d.expiry_date)}</span><span className="t-caption">{d.paid ? `Paid ${d.method === 'cash' ? 'in cash' : 'online'}${d.paid_at ? ` on ${date(d.paid_at)}` : ''}` : 'Not paid'}</span></span>
                    <span className="shrink-0 text-right"><span className="block t-num font-medium">{d.amount != null ? money(d.amount) : '—'}</span><StatusBadge status={d.status} /></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {open && (open.membership_status === 'active' || open.membership_status === 'expired') && (
          <form className="mt-6 space-y-3 border-t border-border pt-5" onSubmit={(e) => { e.preventDefault(); setExp.mutate(open); }}>
            <h3 className="t-section">Set expiry date</h3>
            <p className="t-caption">Changes the end of the latest paid period: correct a date, extend it, or end it early. No ledger entry is written; use cash dues above to record money.</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1"><LabeledInput label="Membership ends" type="date" required min={new Date().toISOString().slice(0, 10)} value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
              <Button type="submit" variant="secondary" loading={setExp.isPending} disabled={!expiry} icon={<CalendarClock className="size-4" aria-hidden />}>Set expiry</Button>
            </div>
            <ErrorState error={setExp.error} />
            <Button type="button" variant="ghost" className="w-full sm:w-auto" loading={remind.isPending} onClick={() => remind.mutate(open)} icon={<BellRing className="size-4" aria-hidden />}>Send renewal reminder now</Button>
            <p className="t-caption">Reminders also go out automatically 14 days before expiry and on the day.</p>
          </form>
        )}
        {open && (
          <form id="dues-form" className="mt-6 space-y-3 border-t border-border pt-5" onSubmit={(e) => { e.preventDefault(); cash.mutate(open); }}>
            <h3 className="t-section">{open.membership_status === 'active' ? 'Extend membership (cash)' : 'Add membership (cash)'}</h3>
            <p className="t-caption">{open.membership_status === 'active' ? `Adds a new period from the day after ${date(open.expiry_date)}.` : 'Activates today.'} Leave the date empty for the academic year end.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledInput label="Amount ₹" type="number" inputMode="decimal" min="1" step="0.01" required value={dues.amount} onChange={(e) => setDues({ ...dues, amount: e.target.value })} />
              <LabeledInput label="Valid until (optional)" type="date" value={dues.expiry_date} onChange={(e) => setDues({ ...dues, expiry_date: e.target.value })} />
            </div>
            <ErrorState error={cash.error} />
          </form>
        )}
      </Modal>
    </>
  );
}

type WalkInResult = { user: { id: number; name: string; email: string }; member: { id: number; student_id: string }; membership: { status: string; expiry_date: string } | null; setup_link_sent: boolean; qr_token: string | null };

/**
 * New member at the club's table: creates the account and member profile, optionally records cash dues (one ledger
 * row), and emails a set-password link. Then a confirmation with the member's status and their membership QR.
 */
function WalkInModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (member_id: number) => void }) {
  const toast = useToast();
  const offer = useQuery({ queryKey: ['membership', 'info'], queryFn: () => get<MembershipOffer>('/membership/info'), enabled: open, staleTime: 5 * 60_000 });
  const blank = { name: '', email: '', student_id: '', phone: '', pay_cash: true, amount: '' };
  const [v, setV] = useState(blank);
  const [result, setResult] = useState<WalkInResult | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const amount = v.amount || String(offer.data?.price ?? '');
  const save = useMutation({
    mutationFn: () => post<WalkInResult>('/admin/members/walk-in', { name: v.name, email: v.email, student_id: v.student_id, phone: v.phone || undefined, pay_cash: v.pay_cash, amount: v.pay_cash && amount ? Number(amount) : undefined }),
    onSuccess: (r) => { setResult(r); onAdded(r.member.id); toast.success('Member added', r.membership ? `Active until ${date(r.membership.expiry_date)}.` : 'No membership yet.'); },
  });
  // Same QR as the member's own /me page (dark on light, which every scanner reads).
  useEffect(() => {
    if (!result?.qr_token) return setQr(null);
    (async () => { try { const QR = await import('qrcode'); setQr(await QR.toDataURL(result.qr_token!, { margin: 1, width: 720, color: { dark: '#0B0B0D', light: '#F6E9CE' } })); } catch { setQr(null); } })();
  }, [result?.qr_token]);
  const close = () => { onClose(); setResult(null); setV(blank); setQr(null); save.reset(); };
  const err = save.error as (Error & { body?: { field?: string } }) | null;
  const dupField = err?.body?.field;
  return (
    <Modal open={open} onClose={close} title={result ? result.user.name : 'New member at table'} description={result ? result.user.email : 'Sign someone up on the spot. They get an email to set their password.'}
      footer={result
        ? <><Button variant="secondary" onClick={() => { setResult(null); setV(blank); setQr(null); save.reset(); }} icon={<UserPlus className="size-4" aria-hidden />}>Add another</Button><Button onClick={close}>Done</Button></>
        : <><Button variant="secondary" onClick={close}>Cancel</Button><Button form="walk-in-form" type="submit" loading={save.isPending} icon={v.pay_cash ? <Wallet className="size-4" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}>{v.pay_cash ? `Sign up · ${money(amount || 0)} cash` : 'Sign up'}</Button></>}>
      {result ? (
        <div className="space-y-4">
          <p role="status" className="flex items-start gap-2 rounded-[var(--radius-md)] border border-success/40 bg-success-soft p-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />{result.membership ? `Active until ${date(result.membership.expiry_date)}. ${money(amount || 0)} cash recorded in the ledger.` : 'Signed up. No membership yet: record cash dues from their profile when they pay.'}
          </p>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="t-label">Student ID</dt><dd className="mt-0.5 font-mono">{result.member.student_id}</dd></div>
            <div><dt className="t-label">Membership</dt><dd className="mt-1"><StatusBadge status={result.membership ? 'active' : 'none'}>{result.membership ? 'active' : 'no membership'}</StatusBadge></dd></div>
          </dl>
          <p className="flex items-start gap-2 text-sm text-text-secondary"><Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
            {result.setup_link_sent ? `Password link emailed to ${result.user.email}.` : `Email isn't set up, so the password link for ${result.user.email} is in the server log. Copy it from there for them.`}</p>
          {result.qr_token && (qr
            ? <figure className="text-center"><img src={qr} alt={`Membership QR for ${result.user.name}`} width={240} height={240} className="mx-auto w-60 max-w-full rounded-[var(--radius-md)] bg-cream p-2" /><figcaption className="t-caption mt-2 inline-flex items-center gap-1"><QrCode className="size-3" aria-hidden />Their membership QR. They'll also find it on their account page.</figcaption></figure>
            : <div className="skeleton mx-auto h-60 w-60" aria-label="Loading QR" />)}
        </div>
      ) : (
        <form id="walk-in-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <LabeledInput label="Full name" required maxLength={120} autoComplete="off" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledInput label="Email" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} required maxLength={190} value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} error={dupField === 'email' ? err?.message : undefined} />
            <LabeledInput label="Student ID" required maxLength={40} autoCapitalize="characters" autoCorrect="off" spellCheck={false} value={v.student_id} onChange={(e) => setV({ ...v, student_id: e.target.value })} error={dupField === 'student_id' ? err?.message : undefined} />
            <LabeledInput label="Phone (optional)" type="tel" inputMode="tel" maxLength={30} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
            <LabeledInput label="Amount ₹" type="number" inputMode="decimal" min="1" step="0.01" required={v.pay_cash} disabled={!v.pay_cash} value={amount} onChange={(e) => setV({ ...v, amount: e.target.value })} hint={offer.data ? `Dues are ${money(offer.data.price)}.` : undefined} />
          </div>
          <label className="inline-flex min-h-12 cursor-pointer items-center gap-3 rounded-full border border-border-strong px-4 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={v.pay_cash} onChange={(e) => setV({ ...v, pay_cash: e.target.checked })} />Paid dues in cash
          </label>
          {!dupField && <ErrorState error={save.error} />}
        </form>
      )}
    </Modal>
  );
}
