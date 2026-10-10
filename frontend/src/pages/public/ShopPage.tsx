import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { get, post } from '@/api/client';
import type { Checkout, Product } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Empty, ErrorBox, PageTitle, money } from '@/components/ui';
import { CheckoutModal } from '@/components/CheckoutModal';

export function ShopPage() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['products'], queryFn: () => get<Product[]>('/products') });
  const [cart, setCart] = useState<Record<number, number>>({});
  const [checkout, setCheckout] = useState<Checkout>(null);
  const order = useMutation({ mutationFn: () => post<{ checkout: Checkout }>('/orders', { items: Object.entries(cart).filter(([, q]) => q > 0).map(([variant_id, qty]) => ({ variant_id: Number(variant_id), qty })) }), onSuccess: (r) => { setCheckout(r.checkout); setCart({}); qc.invalidateQueries({ queryKey: ['products'] }); } });
  const variants = (q.data ?? []).flatMap((p) => p.variants.map((v) => ({ ...v, product: p })));
  const total = variants.reduce((s, v) => s + (cart[v.id] ?? 0) * v.price_for_you, 0);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  return (
    <>
      <PageTitle title="Merchandise" sub="Live stock. Members get member pricing automatically." />
      {q.isLoading ? 'Loading…' : !q.data?.length ? <Empty>No products yet.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data.map((p) => (
            <div key={p.id} className="card">
              {p.image_url && <img src={p.image_url} alt="" className="rounded-lg mb-3 h-40 w-full object-cover" />}
              <h3 className="font-semibold">{p.name}</h3><p className="text-sm text-slate-500">{p.description}</p>
              <table className="table mt-3"><thead><tr><th>Size</th><th>Price</th><th>Available</th><th>Qty</th></tr></thead><tbody>
                {p.variants.map((v) => (
                  <tr key={v.id}><td>{v.size}</td><td>{money(v.price_for_you)}</td><td>{v.available}</td>
                    <td><input type="number" min={0} max={v.available} className="input !w-20" value={cart[v.id] ?? 0} disabled={!me || v.available === 0} onChange={(e) => setCart({ ...cart, [v.id]: Math.max(0, Math.min(v.available, Number(e.target.value))) })} /></td></tr>
                ))}
              </tbody></table>
            </div>
          ))}
        </div>
      )}
      <div className="card mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>{me ? <>Cart: <b>{count}</b> items · <b>{money(total)}</b></> : <>Please <Link className="text-indigo-600" to="/login">log in</Link> to order.</>}</div>
        <button className="btn-primary" disabled={!me || count === 0 || order.isPending} onClick={() => order.mutate()}>Place order</button>
      </div>
      <ErrorBox error={order.error} />
      {checkout && <CheckoutModal checkout={checkout} title="Merchandise order" onClose={() => setCheckout(null)} />}
    </>
  );
}
