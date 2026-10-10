import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/api/client';
import type { Event, Fundraiser, Member } from '@/api/types';
import { ErrorBox, Field, PageTitle, money } from '@/components/ui';

/** Cash still gets recorded (§8): dues at the table, door tickets, bake-sale income. */
export function RecordCashPage() {
  const qc = useQueryClient();
  const members = useQuery({ queryKey: ['members', 'all'], queryFn: () => get<Member[]>('/members') });
  const events = useQuery({ queryKey: ['events'], queryFn: () => get<Event[]>('/events') });
  const frs = useQuery({ queryKey: ['fundraisers'], queryFn: () => get<Fundraiser[]>('/fundraisers') });
  const [dues, setDues] = useState({ member_id: '', amount: '500' });
  const [tkt, setTkt] = useState({ event_id: '', holder_name: '', holder_email: '', member_id: '' });
  const [cash, setCash] = useState({ fundraiser_id: '', amount: '', memo: '' });
  const done = () => qc.invalidateQueries();
  const mDues = useMutation({ mutationFn: () => post(`/members/${dues.member_id}/cash-payment`, { amount: Number(dues.amount) }), onSuccess: done });
  const mTkt = useMutation({ mutationFn: () => post(`/events/${tkt.event_id}/cash-ticket`, { ...tkt, member_id: tkt.member_id ? Number(tkt.member_id) : undefined }), onSuccess: done });
  const mCash = useMutation({ mutationFn: () => post(`/fundraisers/${cash.fundraiser_id}/cash-income`, { amount: Number(cash.amount), memo: cash.memo || undefined }), onSuccess: done });
  const inactive = members.data?.filter((m) => m.membership_status !== 'active') ?? [];
  return (
    <>
      <PageTitle title="Record cash" sub="Each entry creates a cash payment and a ledger row, exactly like online income." />
      <div className="grid gap-6 lg:grid-cols-3">
        <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); mDues.mutate(); }}>
          <h3 className="font-semibold">Membership dues</h3>
          <Field label="Member (without active membership)"><select className="input" required value={dues.member_id} onChange={(e) => setDues({ ...dues, member_id: e.target.value })}><option value="">—</option>{inactive.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.student_id}</option>)}</select></Field>
          <Field label="Amount"><input className="input" type="number" value={dues.amount} onChange={(e) => setDues({ ...dues, amount: e.target.value })} /></Field>
          <ErrorBox error={mDues.error} />{mDues.isSuccess && <p className="text-sm text-emerald-700">Membership activated.</p>}
          <button className="btn-primary w-full">Record {money(dues.amount)}</button>
        </form>
        <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); mTkt.mutate(); }}>
          <h3 className="font-semibold">Door ticket</h3>
          <Field label="Event"><select className="input" required value={tkt.event_id} onChange={(e) => setTkt({ ...tkt, event_id: e.target.value })}><option value="">—</option>{events.data?.filter((x) => x.status !== 'draft').map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></Field>
          <Field label="Name"><input className="input" required value={tkt.holder_name} onChange={(e) => setTkt({ ...tkt, holder_name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" required value={tkt.holder_email} onChange={(e) => setTkt({ ...tkt, holder_email: e.target.value })} /></Field>
          <Field label="Member (optional, for member price)"><select className="input" value={tkt.member_id} onChange={(e) => setTkt({ ...tkt, member_id: e.target.value })}><option value="">Non-member</option>{members.data?.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.student_id}</option>)}</select></Field>
          <ErrorBox error={mTkt.error} />{mTkt.isSuccess && <p className="text-sm text-emerald-700">Ticket issued and emailed.</p>}
          <button className="btn-primary w-full">Issue ticket</button>
        </form>
        <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); mCash.mutate(); }}>
          <h3 className="font-semibold">Fundraiser cash income</h3>
          <Field label="Fundraiser"><select className="input" required value={cash.fundraiser_id} onChange={(e) => setCash({ ...cash, fundraiser_id: e.target.value })}><option value="">—</option>{frs.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Field label="Amount"><input className="input" type="number" required min="1" value={cash.amount} onChange={(e) => setCash({ ...cash, amount: e.target.value })} /></Field>
          <Field label="Memo"><input className="input" value={cash.memo} onChange={(e) => setCash({ ...cash, memo: e.target.value })} /></Field>
          <ErrorBox error={mCash.error} />{mCash.isSuccess && <p className="text-sm text-emerald-700">Recorded in ledger.</p>}
          <button className="btn-primary w-full">Record income</button>
        </form>
      </div>
    </>
  );
}
