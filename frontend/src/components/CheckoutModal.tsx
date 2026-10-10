import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CreditCard, Info } from 'lucide-react';
import type { Checkout } from '@/api/types';
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

/**
 * Hosted checkout hand-off. With a real Razorpay key_id this opens Razorpay Checkout; the webhook confirms
 * server-side. The UI never flips payment status itself.
 */
export function CheckoutModal({ checkout, onClose, title }: { checkout: Checkout; onClose: () => void; title: string }) {
  const qc = useQueryClient();
  const [opened, setOpened] = useState(false);
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
  if (!checkout) return null;
  const live = !!keyId;
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
    <Modal open onClose={close} title={title} size="sm" footer={<><Button variant="secondary" onClick={close}>{opened ? 'Done' : 'Close'}</Button>{live && <Button onClick={openRazorpay} disabled={opened || sdk === 'loading'} loading={opened || sdk === 'loading'} icon={<CreditCard className="size-4" aria-hidden />}>{opened ? 'Waiting for confirmation…' : 'Pay now'}</Button>}</>}>
      <div className="t-label">Amount due</div>
      <div className="t-metric mt-1">{money(checkout.amount)}</div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="t-label">Order</dt><dd className="mt-0.5 break-all font-mono text-xs">{checkout.order_id}</dd></div>
        <div><dt className="t-label">Provider</dt><dd className="mt-0.5">{checkout.provider}</dd></div>
      </dl>
      <p className="t-caption mt-4">Your seat or stock is held for 15 minutes. It is confirmed only when the payment provider notifies us.</p>
      {live && sdk === 'failed' && <p role="alert" className="mt-3 text-xs text-danger">Could not load Razorpay Checkout. Check your connection or content blockers, then press Pay now again.</p>}
      {!live && <p role="note" className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-warning/40 bg-warning-soft p-3 text-xs text-warning"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />Sandbox mode: no payment keys configured. A treasurer can record this as a cash payment, or the provider webhook can be simulated.</p>}
    </Modal>
  );
}
