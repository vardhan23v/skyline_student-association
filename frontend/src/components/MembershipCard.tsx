import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BadgeCheck, Check } from 'lucide-react';
import { ApiError, get, post } from '@/api/client';
import type { Checkout, Me, MembershipOffer } from '@/api/types';
import { Modal } from './Modal';
import { Button } from './Button';
import { LabeledInput } from './Input';
import { ErrorState, Skeleton } from './EmptyState';
import { CheckoutModal } from './CheckoutModal';
import { date, money } from './format';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Membership is active (paid now, or it already was). useAuthAction resumes the pending action from here. */
  onPaid: () => void;
  /** Why the card opened, e.g. "Spring Gala is for members." */
  reason?: string;
  /** Renewing an active membership: the paid period starts after the current one, so "confirmed" means renewed. */
  renew?: boolean;
};

/**
 * The membership offer: price and benefits from GET /membership/info, "Become a member" starts
 * POST /memberships, and payment goes through CheckoutModal (Razorpay, or "Pay (demo)").
 */
export function MembershipCard({ open, onClose, onPaid, reason, renew = false }: Props) {
  const info = useQuery({ queryKey: ['membership', 'info'], queryFn: () => get<MembershipOffer>('/membership/info'), enabled: open, staleTime: 5 * 60_000 });
  const [checkout, setCheckout] = useState<Checkout>(null);
  const [needsId, setNeedsId] = useState(false);
  const [studentId, setStudentId] = useState('');
  const start = useMutation({
    mutationFn: () => post<{ checkout: Checkout }>('/memberships', needsId ? { student_id: studentId.trim() } : {}),
    onSuccess: (r) => setCheckout(r.checkout),
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'PROFILE_REQUIRED') setNeedsId(true);
      if (e instanceof ApiError && e.code === 'ALREADY_MEMBER') onPaid();
    },
  });
  const reset = () => { setCheckout(null); setNeedsId(false); setStudentId(''); start.reset(); };
  const close = () => { reset(); onClose(); };
  const paid = () => { reset(); onPaid(); };

  if (!open) return null;
  if (checkout) {
    return <CheckoutModal checkout={checkout} title="SSA membership" onClose={close} onPaid={paid}
      confirmed={() => get<Me>('/me').then((m) => (renew ? !m.can_renew : m.is_member))} />;
  }
  const o = info.data;
  const profileError = start.error instanceof ApiError && start.error.code === 'PROFILE_REQUIRED' ? null : start.error;
  return (
    <Modal open onClose={close} size="md" title={<span className="inline-flex items-center gap-2"><BadgeCheck className="size-4 text-accent-text" aria-hidden />{renew ? 'Renew membership' : 'Become a member'}</span>}
      description={reason ?? 'Member prices on events and merch, and members-only events.'}
      footer={<>
        <Button variant="secondary" onClick={close}>Not now</Button>
        <Button onClick={() => start.mutate()} loading={start.isPending} disabled={!o || (needsId && !studentId.trim())}>{renew ? 'Renew' : 'Become a member'}{o ? ` · ${money(o.price)}` : ''}</Button>
      </>}>
      {info.isLoading ? <Skeleton rows={4} /> : info.error ? <ErrorState error={info.error} onRetry={() => info.refetch()} /> : o && (<>
        <div className="flex items-baseline gap-2"><span className="t-metric">{money(o.price)}</span>{o.valid_until && !renew && <span className="t-caption">valid until {date(o.valid_until)}</span>}</div>
        <ul className="mt-4 space-y-2 text-sm" aria-label="Membership benefits">
          {o.benefits.map((b) => <li key={b} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{b}</li>)}
        </ul>
        {needsId && <div className="mt-4"><LabeledInput label="Student ID" required autoFocus value={studentId} onChange={(e) => setStudentId(e.target.value)} hint="We need it once to create your member profile." /></div>}
        <ErrorState error={profileError} className="mt-4" />
      </>)}
    </Modal>
  );
}
