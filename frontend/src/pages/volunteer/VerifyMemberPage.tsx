import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { get } from '@/api/client';
import { ErrorBox, PageTitle, date } from '@/components/ui';

export function VerifyMemberPage() {
  const [sid, setSid] = useState(''); const [qr, setQr] = useState('');
  const m = useMutation({ mutationFn: () => get<any>(qr ? `/members/x/verify?qr_token=${encodeURIComponent(qr)}` : `/members/${encodeURIComponent(sid)}/verify`) });
  return (
    <>
      <PageTitle title="Verify membership" sub="Type a student ID or paste a member QR token." />
      <div className="card max-w-md space-y-3">
        <input className="input" placeholder="Student ID (e.g. SKY2024001)" value={sid} onChange={(e) => setSid(e.target.value)} />
        <input className="input" placeholder="…or member QR token" value={qr} onChange={(e) => setQr(e.target.value)} />
        <button className="btn-primary w-full" onClick={() => m.mutate()} disabled={m.isPending || (!sid && !qr)}>Verify</button>
        <ErrorBox error={m.error} />
        {m.data && <div className={`rounded-xl p-5 text-center ${m.data.valid ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'}`}><div className="text-4xl">{m.data.valid ? '✅' : '❌'}</div><div className="font-semibold mt-1">{m.data.member?.name ?? m.data.reason}</div>{m.data.member && <div className="text-sm">{m.data.member.student_id} · {m.data.valid ? `active until ${date(m.data.expiry_date)}` : m.data.reason}</div>}</div>}
      </div>
    </>
  );
}
