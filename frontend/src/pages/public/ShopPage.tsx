import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, ShoppingBag, X } from 'lucide-react';
import { get, post } from '@/api/client';
import type { Checkout, Order, Product } from '@/api/types';
import { useAuthAction } from '@/hooks/useAuthAction';
import { useToast } from '@/components/Toast';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { CheckoutModal } from '@/components/CheckoutModal';
import { Modal } from '@/components/Modal';
import { money } from '@/components/format';

/** Product cards (size chips with live stock, a quantity stepper per size), a sticky cart bar, and the cart in a Modal
 *  (a bottom sheet on phones). */
/** The cart survives the login round-trip (Place order → /login → back here with ?action=checkout). */
const CART_KEY = 'ssa_cart';
const savedCart = (): Record<number, number> => { try { return JSON.parse(sessionStorage.getItem(CART_KEY) ?? '{}'); } catch { return {}; } };
const saveCart = (c: Record<number, number>) => { try { sessionStorage.setItem(CART_KEY, JSON.stringify(c)); } catch { /* private mode: cart just isn't kept */ } };

export function ShopPage() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['products'], queryFn: () => get<Product[]>('/products') });
  const [cart, setCartState] = useState<Record<number, number>>(savedCart);
  const setCart = (c: Record<number, number>) => { setCartState(c); saveCart(c); };
  const [placed, setPlaced] = useState<{ checkout: Checkout; order: Order } | null>(null);
  const lines = (c: Record<number, number>) => Object.entries(c).filter(([, n]) => n > 0).map(([variant_id, qty]) => ({ variant_id: Number(variant_id), qty }));
  const order = useMutation({
    mutationFn: (c: Record<number, number>) => post<{ checkout: Checkout; order: Order }>('/orders', { items: lines(c) }),
    onSuccess: (r) => { setPlaced(r); setCart({}); qc.invalidateQueries({ queryKey: ['products'] }); qc.invalidateQueries({ queryKey: ['orders'] }); },
  });
  // Login required (any signed-in user; members get member prices). Back from /login, the saved cart is ordered.
  const { runProtected, card, me } = useAuthAction({ onResume: (a) => { const c = savedCart(); if (a === 'checkout' && lines(c).length) void order.mutateAsync(c).catch(() => {}); } });
  const placeOrder = () => void runProtected(() => order.mutateAsync(cart), { resume: 'checkout' }).catch(() => {});
  const paid = () => { setPlaced(null); qc.invalidateQueries({ queryKey: ['orders'] }); qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Order paid', 'Track it under My account.'); };
  const variants = (q.data ?? []).flatMap((p) => p.variants);
  const total = variants.reduce((s, v) => s + (cart[v.id] ?? 0) * v.price_for_you, 0);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  // POST /orders caps each line at qty 20.
  const MAX_QTY = 20;
  const setQty = (id: number, n: number, max: number) => setCart({ ...cart, [id]: Math.max(0, Math.min(max, MAX_QTY, n)) });
  const [cartOpen, setCartOpen] = useState(false);
  const inCart = (q.data ?? []).flatMap((p) => p.variants.filter((v) => (cart[v.id] ?? 0) > 0).map((v) => ({ p, v, n: cart[v.id] })));
  const checkout = () => { setCartOpen(false); placeOrder(); };
  return (
    <>
      <PageHeader eyebrow="Merchandise" script="club" title="Shop" description={me?.is_member ? 'Member pricing applied.' : 'Live stock. Members get member pricing automatically.'} />
      {q.isLoading ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">{[0, 1, 2].map((i) => <div key={i} className="card h-72 skeleton" />)}</div> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <EmptyState icon={<ShoppingBag className="size-5" aria-hidden />} title="No products yet" />
      ) : (
        // 2 columns on phones, 3 from tablet.
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          {q.data.map((p) => <ProductCard key={p.id} p={p} cart={cart} member={!!me?.is_member} setQty={setQty} max={MAX_QTY} />)}
        </div>
      )}
      <div className="glass sticky bottom-safe z-20 mt-6 flex items-center justify-between gap-3 rounded-[var(--radius-xl)] py-2.5 pl-5 pr-2.5">
        <div className="min-w-0 text-sm"><span className="t-label mr-2 hidden sm:inline">Cart</span><b className="t-num">{count}</b> item{count === 1 ? '' : 's'} · <b className="t-num">{money(total)}</b>{!me && <span className="ml-2 hidden t-caption sm:inline">You'll log in to order.</span>}</div>
        <Button disabled={count === 0} loading={order.isPending} onClick={() => setCartOpen(true)} icon={<ShoppingBag className="size-4" aria-hidden />}>View cart</Button>
      </div>
      <ErrorState error={order.error} className="mt-3" />
      <Modal open={cartOpen} onClose={() => setCartOpen(false)} size="md" title="Your cart" description={me ? (me.is_member ? 'Member prices applied.' : undefined) : "You'll log in to place the order; the cart is kept."}
        footer={<><Button variant="secondary" onClick={() => setCartOpen(false)}>Keep shopping</Button><Button disabled={count === 0} loading={order.isPending} onClick={checkout} icon={<ShoppingBag className="size-4" aria-hidden />}>Place order · {money(total)}</Button></>}>
        {inCart.length === 0 ? <p className="t-caption">Your cart is empty.</p> : (
          <ul className="divide-y divide-border" aria-label="Cart items">
            {inCart.map(({ p, v, n }) => (
              <li key={v.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{p.name}</div><div className="t-caption">Size {v.size} · {money(v.price_for_you)} each</div></div>
                <Stepper n={n} size={v.size} max={Math.min(v.available, MAX_QTY)} onChange={(x) => setQty(v.id, x, v.available)} />
                <button type="button" aria-label={`Remove ${p.name} size ${v.size}`} onClick={() => setQty(v.id, 0, v.available)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-text-tertiary hover:text-text-primary"><X className="size-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3"><span className="t-label">Total</span><span className="t-metric !text-2xl">{money(total)}</span></div>
      </Modal>
      {card}
      {placed && <CheckoutModal checkout={placed.checkout} title={`Order #${placed.order.id}`} onClose={() => setPlaced(null)} onPaid={paid}
        confirmed={() => get<Order>(`/orders/${placed.order.id}`).then((o) => o.status === 'paid')} />}
    </>
  );
}

function Stepper({ n, size, max, onChange }: { n: number; size: string; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`Quantity for size ${size}`}>
      <button type="button" aria-label="Decrease" disabled={n === 0} onClick={() => onChange(n - 1)} className="inline-flex size-11 items-center justify-center rounded-full border border-border-strong text-text-secondary disabled:opacity-30 hover:bg-surface-elevated"><Minus className="size-3.5" aria-hidden /></button>
      <output className="w-6 text-center font-mono text-base t-num" aria-live="polite">{n}</output>
      <button type="button" aria-label="Increase" disabled={n >= max} onClick={() => onChange(n + 1)} className="inline-flex size-11 items-center justify-center rounded-full border border-border-strong text-text-secondary disabled:opacity-30 hover:bg-surface-elevated"><Plus className="size-3.5" aria-hidden /></button>
    </div>
  );
}

/** One product: pick a size from 44px chips (sold-out sizes disabled and named), then set the quantity for it. */
function ProductCard({ p, cart, member, setQty, max }: { p: Product; cart: Record<number, number>; member: boolean; setQty: (id: number, n: number, max: number) => void; max: number }) {
  const [sel, setSel] = useState<number>(() => (p.variants.find((v) => v.available > 0) ?? p.variants[0])?.id);
  const v = p.variants.find((x) => x.id === sel) ?? p.variants[0];
  const out = p.variants.filter((x) => x.available === 0).map((x) => x.size);
  const n = v ? cart[v.id] ?? 0 : 0;
  return (
    <article className="card flex min-w-0 flex-col gap-3 overflow-hidden !p-3 sm:!p-4" aria-labelledby={`prod-${p.id}`}>
      <div className="relative -mx-3 -mt-3 aspect-[4/3] overflow-hidden border-b border-border bg-surface-sunken sm:-mx-4 sm:-mt-4">
        {p.image_url ? <img src={p.image_url} alt="" width={480} height={360} loading="lazy" decoding="async" sizes="(min-width: 768px) 33vw, 50vw" className="h-full w-full object-cover" /> : (
          <div className="dots absolute inset-0 flex items-end p-3"><span className="font-display text-4xl leading-none tracking-tighter text-text-tertiary/60 select-none sm:text-5xl" aria-hidden>{p.name.replace(/^SSA\s*/i, '').slice(0, 3).toUpperCase()}</span><span className="absolute right-0 top-0 h-full w-8 stripes opacity-50" aria-hidden /></div>
        )}
      </div>
      <div className="min-w-0">
        <h2 id={`prod-${p.id}`} className="t-section !text-sm sm:!text-base">{p.name}</h2>
        {v && <p className="mt-0.5 text-base font-medium t-num">{money(v.price_for_you)}{member && Number(v.member_price) < Number(v.price) && <s className="ml-1.5 text-xs font-normal text-text-tertiary">{money(v.price)}</s>}</p>}
      </div>
      <div role="radiogroup" aria-label={`${p.name} size`} className="flex flex-wrap gap-2">
        {p.variants.map((x) => {
          const sold = x.available === 0, qty = cart[x.id] ?? 0;
          return (
            <button key={x.id} type="button" role="radio" aria-checked={x.id === v?.id} disabled={sold} onClick={() => setSel(x.id)}
              aria-label={`Size ${x.size}${sold ? ', out of stock' : ''}${qty ? `, ${qty} in cart` : ''}`} className="chip relative !px-3">
              {x.size}{qty > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-accent text-[0.6rem] text-accent-foreground" aria-hidden>{qty}</span>}
            </button>
          );
        })}
      </div>
      {v && <p className={`t-caption ${v.available === 0 ? '!text-danger' : v.available < 5 ? '!text-warning' : ''}`}>{v.available === 0 ? `Size ${v.size} is out of stock` : v.available < 5 ? `Only ${v.available} left in ${v.size}` : `${v.available} in stock`}{out.length > 0 && v.available > 0 && <span className="block">Out of stock: {out.join(', ')}</span>}</p>}
      {v && <div className="mt-auto"><Stepper n={n} size={v.size} max={Math.min(v.available, max)} onChange={(x) => setQty(v.id, x, v.available)} /></div>}
    </article>
  );
}
