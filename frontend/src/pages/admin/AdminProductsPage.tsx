import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch, post } from '@/api/client';
import type { Product } from '@/api/types';
import { Badge, ErrorBox, Field, PageTitle, money } from '@/components/ui';

export function AdminProductsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['products'], queryFn: () => get<Product[]>('/products') });
  const orders = useQuery({ queryKey: ['orders', 'admin'], queryFn: () => get<any[]>('/orders') });
  const [f, setF] = useState({ name: '', description: '', sizes: 'S,M,L,XL', price: '500', member_price: '400', stock: '10' });
  const create = useMutation({ mutationFn: () => post('/products', { name: f.name, description: f.description || undefined, variants: f.sizes.split(',').map((s) => s.trim()).filter(Boolean).map((size) => ({ size, price: Number(f.price), member_price: Number(f.member_price), stock: Number(f.stock) })) }), onSuccess: () => { setF({ ...f, name: '', description: '' }); qc.invalidateQueries({ queryKey: ['products'] }); } });
  const stock = useMutation({ mutationFn: ({ id, stock }: { id: number; stock: number }) => patch(`/variants/${id}`, { stock }), onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }) });
  const fulfil = useMutation({ mutationFn: (id: number) => patch(`/orders/${id}/fulfil`), onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }) });
  return (
    <>
      <PageTitle title="Products & stock" />
      <div className="grid gap-6 lg:grid-cols-3">
        <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <h3 className="font-semibold">New product</h3>
          <Field label="Name"><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Sizes (comma-separated)"><input className="input" value={f.sizes} onChange={(e) => setF({ ...f, sizes: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-2"><Field label="Price"><input className="input" type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field><Field label="Member"><input className="input" type="number" value={f.member_price} onChange={(e) => setF({ ...f, member_price: e.target.value })} /></Field><Field label="Stock/size"><input className="input" type="number" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} /></Field></div>
          <ErrorBox error={create.error} /><button className="btn-primary w-full">Create</button>
        </form>
        <div className="lg:col-span-2 space-y-4">
          {q.data?.map((p) => <div key={p.id} className="card"><h3 className="font-semibold">{p.name} {!p.is_active && <Badge s="closed" />}</h3>
            <table className="table mt-2"><thead><tr><th>Size</th><th>Price / member</th><th>Stock</th><th>Reserved</th><th>Available</th><th>Set stock</th></tr></thead><tbody>
              {p.variants.map((v) => <tr key={v.id}><td>{v.size}</td><td>{money(v.price)} / {money(v.member_price)}</td><td>{v.stock}</td><td>{v.reserved}</td><td className={v.available < 5 ? 'text-rose-600 font-medium' : ''}>{v.available}</td><td><input type="number" className="input !w-24" defaultValue={v.stock} onBlur={(e) => Number(e.target.value) !== v.stock && stock.mutate({ id: v.id, stock: Number(e.target.value) })} /></td></tr>)}
            </tbody></table></div>)}
          <div className="card"><h3 className="font-semibold mb-2">Orders</h3><table className="table"><thead><tr><th>#</th><th>User</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>
            {orders.data?.map((o) => <tr key={o.id}><td>{o.id}</td><td>{o.user_id}</td><td>{money(o.total)}</td><td><Badge s={o.status} /></td><td>{o.status === 'paid' && <button className="text-indigo-600 text-xs" onClick={() => fulfil.mutate(o.id)}>Mark handed over</button>}</td></tr>)}
          </tbody></table></div>
        </div>
      </div>
    </>
  );
}
