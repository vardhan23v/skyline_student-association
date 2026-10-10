import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Ticket, UserRound } from 'lucide-react';
import { get, post } from '@/api/client';
import type { Event, Fundraiser, Member } from '@/api/types';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { LabeledInput, LabeledSelect } from '@/components/Input';
import { ErrorState } from '@/components/EmptyState';
import { useToast } from '@/components/Toast';
import { money } from '@/components/format';

/** Cash still gets recorded: each form creates a cash payment and a ledger row, exactly like online income. */
export function RecordCashPage() {
  const qc = useQueryClient(); const toast = useToast();
  const members = useQuery({ queryKey: ['members', 'all'], queryFn: () => get<Member[]>('/members') });
  const events = useQuery({ queryKey: ['events'], queryFn: () => get<Event[]>('/events') });
  const frs = useQuery({ queryKey: ['fundraisers'], queryFn: () => get<Fundraiser[]>('/fundraisers') });
  const [dues, setDues] = useState({ member_id: '', amount: '500' });
  const [tkt, setTkt] = useState({ event_id: '', holder_name: '', holder_email: '', member_id: '' });
  const [cash, setCash] = useState({ fundraiser_id: '', amount: '', memo: '' });
  const done = (msg: string) => { qc.invalidateQueries(); toast.success(msg, 'Ledger entry written.'); };
  const mDues = useMutation({ mutationFn: () => post(`/members/${dues.member_id}/cash-payment`, { amount: Number(dues.amount) }), onSuccess: () => { done('Membership activated'); setDues({ member_id: '', amount: '500' }); } });
  const mTkt = useMutation({ mutationFn: () => post(`/events/${tkt.event_id}/cash-ticket`, { ...tkt, member_id: tkt.member_id ? Number(tkt.member_id) : undefined }), onSuccess: () => { done('Ticket issued and emailed'); setTkt({ ...tkt, holder_name: '', holder_email: '', member_id: '' }); } });
  const mCash = useMutation({ mutationFn: () => post(`/fundraisers/${cash.fundraiser_id}/cash-income`, { amount: Number(cash.amount), memo: cash.memo || undefined }), onSuccess: () => { done('Cash income recorded'); setCash({ ...cash, amount: '', memo: '' }); } });
  const inactive = members.data?.filter((m) => m.membership_status !== 'active') ?? [];
  const Head = ({ icon: Icon, t, d }: { icon: typeof Banknote; t: string; d: string }) => <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent"><Icon className="size-4" aria-hidden /></span><div><h2 className="t-section">{t}</h2><p className="t-caption">{d}</p></div></div>;
  return (
    <>
      <PageHeader eyebrow="Finance" title="Record cash" description="Each entry creates a cash payment and a ledger row, exactly like online income." />
      <div className="grid gap-5 lg:grid-cols-3">
        <form className="card space-y-4" onSubmit={(e) => { e.preventDefault(); mDues.mutate(); }}>
          <Head icon={UserRound} t="Membership dues" d="At the sign-up table." />
          <LabeledSelect label="Member (without active membership)" required value={dues.member_id} onChange={(e) => setDues({ ...dues, member_id: e.target.value })}><option value="">Select…</option>{inactive.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.student_id}</option>)}</LabeledSelect>
          <LabeledInput label="Amount ₹" type="number" inputMode="decimal" required min="1" step="0.01" value={dues.amount} onChange={(e) => setDues({ ...dues, amount: e.target.value })} />
          <ErrorState error={mDues.error} />
          <Button type="submit" className="w-full" loading={mDues.isPending}>Record {money(dues.amount)}</Button>
        </form>
        <form className="card space-y-4" onSubmit={(e) => { e.preventDefault(); mTkt.mutate(); }}>
          <Head icon={Ticket} t="Door ticket" d="Issued and emailed on the spot." />
          <LabeledSelect label="Event" required value={tkt.event_id} onChange={(e) => setTkt({ ...tkt, event_id: e.target.value })}><option value="">Select…</option>{events.data?.filter((x) => x.status !== 'draft').map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</LabeledSelect>
          <LabeledInput label="Name" autoComplete="off" required value={tkt.holder_name} onChange={(e) => setTkt({ ...tkt, holder_name: e.target.value })} />
          <LabeledInput label="Email" type="email" autoComplete="off" required value={tkt.holder_email} onChange={(e) => setTkt({ ...tkt, holder_email: e.target.value })} />
          <LabeledSelect label="Member (optional, for member price)" value={tkt.member_id} onChange={(e) => setTkt({ ...tkt, member_id: e.target.value })}><option value="">Non-member</option>{members.data?.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.student_id}</option>)}</LabeledSelect>
          <ErrorState error={mTkt.error} />
          <Button type="submit" className="w-full" loading={mTkt.isPending}>Issue ticket</Button>
        </form>
        <form className="card space-y-4" onSubmit={(e) => { e.preventDefault(); mCash.mutate(); }}>
          <Head icon={Banknote} t="Fundraiser cash income" d="Bake sales, donations, stalls." />
          <LabeledSelect label="Fundraiser" required value={cash.fundraiser_id} onChange={(e) => setCash({ ...cash, fundraiser_id: e.target.value })}><option value="">Select…</option>{frs.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</LabeledSelect>
          <LabeledInput label="Amount ₹" type="number" inputMode="decimal" required min="1" step="0.01" value={cash.amount} onChange={(e) => setCash({ ...cash, amount: e.target.value })} />
          <LabeledInput label="Memo" value={cash.memo} onChange={(e) => setCash({ ...cash, memo: e.target.value })} />
          <ErrorState error={mCash.error} />
          <Button type="submit" className="w-full" loading={mCash.isPending}>Record income</Button>
        </form>
      </div>
    </>
  );
}
