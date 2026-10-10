import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, IdCard, XCircle } from 'lucide-react';
import { get } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { LabeledInput } from '@/components/Input';
import { ErrorState } from '@/components/EmptyState';
import { date } from '@/components/format';

export function VerifyMemberPage() {
  const [sid, setSid] = useState(''); const [qr, setQr] = useState('');
  const m = useMutation({ mutationFn: () => get<any>(qr.trim() ? `/admin/members/x/verify?qr_token=${encodeURIComponent(qr.trim())}` : `/admin/members/${encodeURIComponent(sid.trim())}/verify`) });
  return (
    <>
      <PageHeader eyebrow="Check-in" title="Verify membership" description="Type a student ID or paste a member QR token." />
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="card space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <LabeledInput label="Student ID" placeholder="e.g. SKY2024001" autoComplete="off" value={sid} onChange={(e) => { setSid(e.target.value); setQr(''); m.reset(); }} />
          <div className="flex items-center gap-3 t-label"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
          <LabeledInput label="Member QR token" autoComplete="off" value={qr} onChange={(e) => { setQr(e.target.value); setSid(''); m.reset(); }} />
          <Button type="submit" className="w-full" loading={m.isPending} disabled={!sid.trim() && !qr.trim()} icon={<IdCard className="size-4" aria-hidden />}>Verify</Button>
          <ErrorState error={m.error} />
        </form>
        <div role="status" aria-live="polite" className={`flex min-h-48 flex-col items-center justify-center rounded-[var(--radius-xl)] border p-6 text-center ${!m.data ? 'card-sunken text-text-tertiary' : m.data.valid ? 'border-success/50 bg-success-soft text-success' : 'border-danger/50 bg-danger-soft text-danger'}`}>
          {!m.data ? <p className="text-sm">Result appears here</p> : (<>
            {m.data.valid ? <CheckCircle2 className="size-12" aria-hidden /> : <XCircle className="size-12" aria-hidden />}
            <p className="mt-3 font-display text-2xl font-medium text-text-primary">{m.data.member?.name ?? m.data.reason}</p>
            {m.data.member && <p className="mt-1 text-sm"><span className="font-mono">{m.data.member.student_id}</span> · {m.data.valid ? `active until ${date(m.data.expiry_date)}` : m.data.reason}</p>}
          </>)}
        </div>
      </div>
    </>
  );
}
