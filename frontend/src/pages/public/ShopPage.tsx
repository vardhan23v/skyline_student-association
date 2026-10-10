import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Minus, Plus, ShoppingBag } from 'lucide-react';
import { get, post } from '@/api/client';
import type { Checkout, Product } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { CheckoutModal } from '@/components/CheckoutModal';
import { money } from '@/components/format';

/** Editorial product cards with explicit stock per size and a sticky cart bar. */
export function ShopPage() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['products'], queryFn: () => get<Product[]>('/products') });
  const [cart, setCart] = useState<Record<number, number>>({});
  const [checkout, setCheckout] = useState<Checkout>(null);
  const order = useMutation({ mutationFn: () => post<{ checkout: Checkout }>('/orders', { items: Object.entries(cart).filter(([, n]) => n > 0).map(([variant_id, qty]) => ({ variant_id: Number(variant_id), qty })) }), onSuccess: (r) => { setCheckout(r.checkout); setCart({}); qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['orders'] }); } });
  const variants = (q.data ?? []).flatMap((p) => p.variants);
  const total = variants.reduce((s, v) => s + (cart[v.id] ?? 0) * v.price_for_you, 0);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  // POST /orders caps each line at qty 20.
  const MAX_QTY = 20;
  const setQty = (id: number, n: number, max: number) => setCart({ ...cart, [id]: Math.max(0, Math.min(max, MAX_QTY, n)) });
  return (
    <>
      <PageHeader eyebrow="Merchandise" title="Shop" description={me?.active ? 'Member pricing applied.' : 'Live stock. Members get member pricing automatically.'} />
      {q.isLoading ? <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="card h-72 skeleton" />)}</div> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyState icon={<ShoppingBag className="size-5" aria-hidden />} title="No products yet" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data.map((p) => (
            <article key={p.id} className="card flex flex-col gap-4 overflow-hidden">
              <div className="relative -mx-5 -mt-5 h-36 overflow-hidden border-b border-border bg-surface-sunken">
                {p.image_url ? <img src={p.image_url} alt="" width={640} height={144} loading="lazy" className="h-full w-full object-cover" /> : (
                  <div className="dots absolute inset-0 flex items-end p-5"><span className="font-display text-5xl leading-none tracking-tighter text-text-tertiary/60 select-none" aria-hidden>{p.name.replace(/^SSA\s*/i, '').slice(0, 3).toUpperCase()}</span><span className="absolute right-0 top-0 h-full w-10 stripes opacity-50" aria-hidden /></div>
                )}
              </div>
              <div><h2 className="t-section text-lg">{p.name}</h2>{p.description && <p className="t-caption mt-0.5">{p.description}</p>}</div>
              <ul className="divide-y divide-border" aria-label={`${p.name} sizes`}>
                {p.variants.map((v) => {
                  const n = cart[v.id] ?? 0; const out = v.available === 0;
                  return (
                    <li key={v.id} className="flex items-center gap-3 py-2.5">
                      <span className="card-sunken flex size-10 shrink-0 items-center justify-center font-mono text-xs">{v.size}</span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-medium t-num">{money(v.price_for_you)}{me?.active && Number(v.member_price) < Number(v.price) && <s className="ml-1.5 text-xs font-normal text-text-tertiary">{money(v.price)}</s>}</span><span className={`block t-caption ${out ? 'text-danger' : v.available < 5 ? 'text-warning' : ''}`}>{out ? 'Out of stock' : v.available < 5 ? `Only ${v.available} left` : `${v.available} in stock`}</span></span>
                      <div className="flex items-center gap-1" role="group" aria-label={`Quantity for size ${v.size}`}>
                        <button aria-label="Decrease" disabled={!me || n === 0} onClick={() => setQty(v.id, n - 1, v.available)} className="inline-flex size-10 items-center justify-center rounded-full border border-border-strong text-text-secondary disabled:opacity-30 hover:bg-surface-elevated"><Minus className="size-3.5" aria-hidden /></button>
                        <output className="w-6 text-center font-mono text-sm t-num" aria-live="polite">{n}</output>
                        <button aria-label="Increase" disabled={!me || out || n >= Math.min(v.available, MAX_QTY)} onClick={() => setQty(v.id, n + 1, v.available)} className="inline-flex size-10 items-center justify-center rounded-full border border-border-strong text-text-secondary disabled:opacity-30 hover:bg-surface-elevated"><Plus className="size-3.5" aria-hidden /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      )}
      <div className="glass sticky bottom-24 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-xl)] px-5 py-3 lg:bottom-4">
        <div className="text-sm">{me ? <><span className="t-label mr-2">Cart</span><b className="t-num">{count}</b> item{count === 1 ? '' : 's'} · <b className="t-num">{money(total)}</b></> : <>Please <Link className="text-accent" to="/login">log in</Link> to order.</>}</div>
        <Button disabled={!me || count === 0} loading={order.isPending} onClick={() => order.mutate()} icon={<ShoppingBag className="size-4" aria-hidden />}>Place order</Button>
      </div>
      <ErrorState error={order.error} className="mt-3" />
      {checkout && <CheckoutModal checkout={checkout} title="Merchandise order" onClose={() => setCheckout(null)} />}
    </>
  );
}
