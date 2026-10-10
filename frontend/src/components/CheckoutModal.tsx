import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Checkout } from '@/api/types';
import { money } from './ui';

/**
 * Hosted checkout hand-off. With a real Razorpay key_id this opens Razorpay Checkout; the webhook confirms server-side.
 * In sandbox mode (no key) we explain that the payment is confirmed by the provider webhook — the UI never flips status itself (§7).
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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-3xl font-semibold my-3">{money(checkout.amount)}</p>
        <p className="text-sm text-slate-600">Order <code className="text-xs">{checkout.order_id}</code> via {checkout.provider}. Your seat/stock is held for 15 minutes; it is confirmed only when the payment provider notifies us.</p>
        {!live && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-3">Sandbox mode: no payment keys configured. A treasurer can record this as a cash payment, or the provider webhook can be simulated.</p>}
        <div className="flex gap-2 mt-4 justify-end">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          {live && <button className="btn-primary" onClick={openRazorpay} disabled={opened}>{opened ? 'Waiting for confirmation…' : 'Pay now'}</button>}
        </div>
      </div>
    </div>
  );
}
