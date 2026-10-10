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
  const [f, setF] = useState({ name: '', description: '', sizes: 'S,M,L,XL', price: '500', member_price: '400', stock: '10' });
  const create = useMutation({ mutationFn: () => post('/products', { name: f.name, description: f.description || undefined, variants: f.sizes.split(',').map((s) => s.trim()).filter(Boolean).map((size) => ({ size, price: Number(f.price), member_price: Number(f.member_price), stock: Number(f.stock) })) }), onSuccess: () => { setF({ ...f, name: '', description: '' }); setOpen(false); qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Product created'); } });
  const stock = useMutation({ mutationFn: ({ id, stock }: { id: number; stock: number }) => patch(`/variants/${id}`, { stock }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Stock updated'); }, onError: (e: any) => toast.error('Stock update failed', e.message) });
  const fulfil = useMutation({ mutationFn: (id: number) => patch(`/orders/${id}/fulfil`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); toast.success('Order marked handed over'); } });
  return (
    <>
      <PageHeader eyebrow="Merchandise" title="Products & stock" actions={<Button onClick={() => setOpen(true)} icon={<Plus className="size-4" aria-hidden />}>New product</Button>} />
      {q.isLoading ? <div className="card"><Skeleton rows={5} /></div> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="No products yet" action={<Button onClick={() => setOpen(true)}>Add the first product</Button>} /> : (
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
                  <td className="text-right"><label className="sr-only" htmlFor={`st-${v.id}`}>Stock for size {v.size}</label><input id={`st-${v.id}`} type="number" inputMode="numeric" min={0} className="input !w-24 !min-h-10 text-right" defaultValue={v.stock} onBlur={(e) => Number(e.target.value) !== v.stock && stock.mutate({ id: v.id, stock: Number(e.target.value) })} /></td>
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
            { key: 'act', header: '', align: 'right', render: (o) => o.status === 'paid' ? <Button size="sm" variant="secondary" loading={fulfil.isPending && fulfil.variables === o.id} onClick={() => fulfil.mutate(o.id)} icon={<PackageCheck className="size-3.5" aria-hidden />}>Handed over</Button> : null },
          ]} />
      </section>
      <Modal open={open} onClose={() => setOpen(false)} variant="drawer" title="New product" description="One variant is created per size with the same price and stock; adjust stock per size afterwards."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button form="prod-form" type="submit" loading={create.isPending}>Create product</Button></>}>
        <form id="prod-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <LabeledInput label="Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <LabeledInput label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <LabeledInput label="Sizes (comma-separated)" value={f.sizes} onChange={(e) => setF({ ...f, sizes: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <LabeledInput label="Price ₹" type="number" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
            <LabeledInput label="Member ₹" type="number" inputMode="decimal" value={f.member_price} onChange={(e) => setF({ ...f, member_price: e.target.value })} />
            <LabeledInput label="Stock / size" type="number" inputMode="numeric" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} />
          </div>
          <ErrorState error={create.error} />
        </form>
      </Modal>
    </>
  );
}
