import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CreditCard, Info } from 'lucide-react';
import type { Checkout } from '@/api/types';
import { Modal } from './Modal';
import { Button } from './Button';
import { money } from './format';

/**
 * Hosted checkout hand-off. With a real Razorpay key_id this opens Razorpay Checkout; the webhook confirms
 * server-side. The UI never flips payment status itself.
 */
export function CheckoutModal({ checkout, onClose, title }: { checkout: Checkout; onClose: () => void; title: string }) {
  const qc = useQueryClient();
  const [opened, setOpened] = useState(false);
  if (!checkout) return null;
  const live = checkout.key_id && (window as any).Razorpay;
  const openRazorpay = () => {
    const rz = new (window as any).Razorpay({ key: checkout.key_id, amount: Math.round(checkout.amount * 100), currency: checkout.currency, order_id: checkout.order_id, name: 'Skyline Student Association', description: title, handler: () => { setOpened(true); setTimeout(() => qc.invalidateQueries(), 1500); } });
    rz.open();
  };
  return (
    <Modal open onClose={onClose} title={title} size="sm" footer={<><Button variant="secondary" onClick={onClose}>Close</Button>{live && <Button onClick={openRazorpay} disabled={opened} loading={opened} icon={<CreditCard className="size-4" aria-hidden />}>{opened ? 'Waiting for confirmation…' : 'Pay now'}</Button>}</>}>
      <div className="t-label">Amount due</div>
      <div className="t-metric mt-1">{money(checkout.amount)}</div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="t-label">Order</dt><dd className="mt-0.5 break-all font-mono text-xs">{checkout.order_id}</dd></div>
        <div><dt className="t-label">Provider</dt><dd className="mt-0.5">{checkout.provider}</dd></div>
      </dl>
      <p className="t-caption mt-4">Your seat or stock is held for 15 minutes. It is confirmed only when the payment provider notifies us.</p>
      {!live && <p role="note" className="mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-warning/40 bg-warning-soft p-3 text-xs text-warning"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />Sandbox mode: no payment keys configured. A treasurer can record this as a cash payment, or the provider webhook can be simulated.</p>}
    </Modal>
  );
}
