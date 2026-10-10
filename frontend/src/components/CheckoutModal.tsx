import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Info } from 'lucide-react';
import { post } from '@/api/client';
import type { Checkout } from '@/api/types';
import { ErrorState } from './EmptyState';
import { Modal } from './Modal';
import { Button } from './Button';
import { money } from './format';

const RAZORPAY_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let razorpayScript: Promise<void> | null = null;
/** Razorpay Checkout is a hosted script; load it once, on first use, instead of on every page. */
const loadRazorpay = () => {
  if ((window as any).Razorpay) return Promise.resolve();
  razorpayScript ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = RAZORPAY_SRC; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { razorpayScript = null; s.remove(); reject(new Error('Could not load Razorpay Checkout')); };
    document.head.appendChild(s);
  });
  return razorpayScript;
};

type Props = {
  checkout: Checkout; onClose: () => void; title: string;
  /** Called once the payment has settled (demo confirm, or `confirmed()` turning true after Razorpay). */
  onPaid?: () => void;
  /** Live payments settle via the webhook: polled after Razorpay's callback until it reports true. */
  confirmed?: () => Promise<boolean>;
};

/**
 * Payment hand-off. With a Razorpay key_id this opens Razorpay Checkout and the webhook confirms server-side.
 * In demo mode (`checkout.demo`, no gateway configured) "Pay (demo)" calls POST /payments/demo-confirm/:id,
 * which runs the same server path as the webhook. The UI never flips payment status itself.
 */
export function CheckoutModal({ checkout, onClose, title, onPaid, confirmed }: Props) {
  const qc = useQueryClient();
  const [opened, setOpened] = useState(false);
  const paidRef = useRef(onPaid); paidRef.current = onPaid;
  const demo = useMutation({
    mutationFn: () => post(`/payments/demo-confirm/${checkout!.payment_id}`),
    onSuccess: () => { qc.invalidateQueries(); paidRef.current?.(); },
  });
  const [sdk, setSdk] = useState<'loading' | 'ready' | 'failed'>(() => ((window as any).Razorpay ? 'ready' : 'loading'));
  const keyId = checkout?.key_id;
  useEffect(() => {
    if (!keyId) return;
    let alive = true;
    loadRazorpay().then(() => alive && setSdk('ready'), () => alive && setSdk('failed'));
    return () => { alive = false; };
  }, [keyId]);
  // The webhook usually lands a few seconds after Razorpay's client callback; re-check a few times so the
  // ticket / order / membership flips from pending without a manual reload.
  useEffect(() => {
    if (!opened) return;
    const timers = [1500, 4000, 9000].map((ms) => window.setTimeout(() => qc.invalidateQueries(), ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [opened, qc]);
  // …and, when the caller can tell, poll for the settled state (up to ~90 s) so the flow continues on its own.
  const confirmedRef = useRef(confirmed); confirmedRef.current = confirmed;
  useEffect(() => {
    if (!opened || !confirmedRef.current) return;
    let alive = true, tries = 0;
    const tick = async () => {
      if (!alive || tries++ > 45) return;
      if (await confirmedRef.current!().catch(() => false)) { if (alive) paidRef.current?.(); return; }
      window.setTimeout(tick, 2000);
    };
    void tick();
    return () => { alive = false; };
  }, [opened]);
  if (!checkout) return null;
  const live = !!keyId;
  const isDemo = !live && checkout.demo;
  const close = () => { if (opened) qc.invalidateQueries(); onClose(); };
  const openRazorpay = async () => {
    if (sdk !== 'ready') {
      setSdk('loading');
      try { await loadRazorpay(); setSdk('ready'); } catch { setSdk('failed'); return; }
    }
    const rz = new (window as any).Razorpay({ key: checkout.key_id, amount: Math.round(checkout.amount * 100), currency: checkout.currency, order_id: checkout.order_id, name: 'Skyline Student Association', description: title, handler: () => setOpened(true) });
    rz.open();
  };
  return (
    <Modal open onClose={close} title={title} size="sm" footer={<><Button variant="secondary" onClick={close}>{opened ? 'Done' : 'Close'}</Button>{live && <Button onClick={openRazorpay} disabled={opened || sdk === 'loading'} loading={opened || sdk === 'loading'} icon={<CreditCard className="size-4" aria-hidden />}>{opened ? 'Waiting for confirmation…' : 'Pay now'}</Button>}{isDemo && <Button onClick={() => demo.mutate()} loading={demo.isPending} disabled={demo.isSuccess} icon={<CreditCard className="size-4" aria-hidden />}>Pay {money(checkout.amount)} (demo)</Button>}</>}>
      <div className="t-label">Amount due</div>
      <div className="t-metric mt-1">{money(checkout.amount)}</div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="t-label">Order</dt><dd className="mt-0.5 break-all font-mono text-xs">{checkout.order_id}</dd></div>
        <div><dt className="t-label">Provider</dt><dd className="mt-0.5">{checkout.provider}</dd></div>
      </dl>
      <p className="t-caption mt-4">Your seat or stock is held for 15 minutes. It is confirmed only when the payment provider notifies us.</p>
      {live && sdk === 'failed' && <p role="alert" className="mt-3 text-xs text-danger">Could not load Razorpay Checkout. Check your connection or content blockers, then press Pay now again.</p>}
      {isDemo && <p role="note" className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-warning/40 bg-warning-soft p-3 text-xs text-warning"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />Demo payments: no real money moves. The payment is confirmed through the same server path as a real one.</p>}
      {!live && !isDemo && <p role="note" className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-warning/40 bg-warning-soft p-3 text-xs text-warning"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />Online payment isn't set up yet. Pay at the club desk; an admin records it.</p>}
      <ErrorState error={demo.error} className="mt-3" />
    </Modal>
  );
}
