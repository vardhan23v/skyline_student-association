import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageCheck, Plus } from 'lucide-react';
import { get, patch, post } from '@/api/client';
import type { Product } from '@/api/types';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { LabeledInput } from '@/components/Input';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { money } from '@/components/format';

/** Catalogue + stock editing inline, orders queue below. Low stock is text + colour. */
export function AdminProductsPage() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['products'], queryFn: () => get<Product[]>('/products') });
  const orders = useQuery({ queryKey: ['orders', 'admin'], queryFn: () => get<any[]>('/orders') });
  const [open, setOpen] = useState(false);
  const [handover, setHandover] = useState<any | null>(null);
  const [f, setF] = useState({ name: '', description: '', sizes: 'S,M,L,XL', price: '500', member_price: '400', stock: '10' });
  const close = () => setOpen(false);
  const create = useMutation({
    mutationFn: () => {
      // Duplicate sizes would hit UNIQUE(product_id, size) and surface as a bare 500.
      const sizes = [...new Set(f.sizes.split(',').map((s) => s.trim()).filter(Boolean))];
      if (!sizes.length) throw new Error('Enter at least one size.');
      return post('/products', { name: f.name, description: f.description || undefined, variants: sizes.map((size) => ({ size, price: Number(f.price), member_price: Number(f.member_price), stock: Number(f.stock) })) });
    },
    onSuccess: () => { setF({ ...f, name: '', description: '' }); setOpen(false); qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Product created'); },
  });
  const openNew = () => { create.reset(); setOpen(true); };
  const stock = useMutation({ mutationFn: ({ id, stock }: { id: number; stock: number }) => patch(`/variants/${id}`, { stock }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Stock updated'); }, onError: (e: any) => toast.error('Stock update failed', e.message) });
  /** Validate before saving; a cleared field must not become stock 0, and stock can't drop below what open orders have reserved. */
  const saveStock = (input: HTMLInputElement, v: Product['variants'][number]) => {
    const raw = input.value.trim(); const n = Number(raw);
    const revert = () => { input.value = String(v.stock); };
    if (raw === '' || !Number.isInteger(n) || n < 0) return revert();
    if (n === Number(v.stock)) return;
    if (n < Number(v.reserved)) { revert(); return toast.error('Stock too low', `${v.reserved} units of size ${v.size} are reserved by open orders.`); }
    stock.mutate({ id: v.id, stock: n }, { onError: revert });
  };
  const fulfil = useMutation({ mutationFn: (id: number) => patch(`/orders/${id}/fulfil`), onSuccess: () => { setHandover(null); qc.invalidateQueries({ queryKey: ['orders'] }); toast.success('Order marked handed over'); }, onError: (e: Error) => toast.error('Could not update order', e.message) });
  return (
    <>
      <PageHeader eyebrow="Merchandise" title="Products & stock" actions={<Button onClick={openNew} icon={<Plus className="size-4" aria-hidden />}>New product</Button>} />
      {q.isLoading ? <div className="card"><Skeleton rows={5} /></div> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="No products yet" action={<Button onClick={openNew}>Add the first product</Button>} /> : (
        <div className="space-y-4">
          {q.data.map((p) => (
            <section key={p.id} className="card" aria-labelledby={`p-${p.id}`}>
              <SectionHeader title={<span id={`p-${p.id}`}>{p.name}</span>} meta={p.is_active ? undefined : 'inactive'} />
              <div className="overflow-x-auto"><table className="table min-w-[520px]"><thead><tr><th scope="col">Size</th><th scope="col" className="text-right">Price / member</th><th scope="col" className="text-right">Stock</th><th scope="col" className="text-right">Reserved</th><th scope="col" className="text-right">Available</th><th scope="col" className="text-right">Set stock</th></tr></thead><tbody>
                {p.variants.map((v) => <tr key={v.id}>
                  <td><span className="card-sunken inline-flex size-9 items-center justify-center font-mono text-xs">{v.size}</span></td>
                  <td className="text-right t-num">{money(v.price)} <span className="text-text-tertiary">/</span> {money(v.member_price)}</td>
                  <td className="text-right t-num">{v.stock}</td><td className="text-right t-num text-text-secondary">{v.reserved}</td>
                  <td className={`text-right t-num font-medium ${v.available === 0 ? 'text-danger' : v.available < 5 ? 'text-warning' : ''}`}>{v.available}{v.available < 5 && <span className="block t-caption font-normal">{v.available === 0 ? 'out' : 'low'}</span>}</td>
                  <td className="text-right"><label className="sr-only" htmlFor={`st-${v.id}`}>Stock for size {v.size}</label><input key={v.stock} id={`st-${v.id}`} type="number" inputMode="numeric" min={0} step={1} className="input !w-24 !min-h-10 text-right" defaultValue={v.stock} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} onBlur={(e) => saveStock(e.currentTarget, v)} /></td>
                </tr>)}
              </tbody></table></div>
            </section>
          ))}
        </div>
      )}
      <section className="mt-6">
        <SectionHeader title="Orders" meta={orders.data ? `${orders.data.filter((o) => o.status === 'paid').length} to hand over` : undefined} />
        <DataTable rows={orders.data} loading={orders.isLoading} error={orders.error} onRetry={() => orders.refetch()} rowKey={(o) => o.id} caption="All orders" empty={<EmptyState title="No orders yet" />}
          columns={[
            { key: 'id', header: 'Order', render: (o) => <span className="font-mono">#{o.id}</span> },
            { key: 'user', header: 'User', render: (o) => <span className="font-mono text-xs">user {o.user_id}</span>, hideOnMobile: true },
            { key: 'total', header: 'Total', render: (o) => <span className="t-num">{money(o.total)}</span>, align: 'right' },
            { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
            { key: 'act', header: '', align: 'right', render: (o) => o.status === 'paid' ? <Button size="sm" variant="secondary" onClick={() => { fulfil.reset(); setHandover(o); }} icon={<PackageCheck className="size-3.5" aria-hidden />}>Handed over</Button> : null },
          ]} />
      </section>
      {/* Fulfilment can't be undone, so it gets the same confirm step as other irreversible actions. */}
      <Modal open={!!handover} onClose={() => setHandover(null)} size="sm" title={`Hand over order #${handover?.id ?? ''}?`} description="Marks the order fulfilled. This cannot be undone."
        footer={<><Button variant="secondary" onClick={() => setHandover(null)}>Cancel</Button><Button loading={fulfil.isPending} onClick={() => handover && fulfil.mutate(handover.id)} icon={<PackageCheck className="size-4" aria-hidden />}>Mark handed over</Button></>}>
        {handover && <div className="card-sunken flex justify-between p-3 text-sm"><span className="font-mono">#{handover.id} · user {handover.user_id}</span><span className="t-num font-medium">{money(handover.total)}</span></div>}
      </Modal>
      <Modal open={open} onClose={close} variant="drawer" title="New product" description="One variant is created per size with the same price and stock; adjust stock per size afterwards."
        footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button form="prod-form" type="submit" loading={create.isPending}>Create product</Button></>}>
        <form id="prod-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <LabeledInput label="Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <LabeledInput label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <LabeledInput label="Sizes (comma-separated)" required value={f.sizes} onChange={(e) => setF({ ...f, sizes: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <LabeledInput label="Price ₹" type="number" inputMode="decimal" min="0" step="0.01" required value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
            <LabeledInput label="Member ₹" type="number" inputMode="decimal" min="0" step="0.01" required value={f.member_price} onChange={(e) => setF({ ...f, member_price: e.target.value })} />
            <LabeledInput label="Stock / size" type="number" inputMode="numeric" min="0" step="1" required value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} />
          </div>
          <ErrorState error={create.error} />
        </form>
      </Modal>
    </>
  );
}
