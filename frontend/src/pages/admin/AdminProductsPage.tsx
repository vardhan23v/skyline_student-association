import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Radio, Search, XCircle } from 'lucide-react';
import { get, patch, post } from '@/api/client';
import { getToken } from '@/auth/token';
import type { AdminOrderRow, AdminOrdersPage, OrderStatus, Product } from '@/api/types';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { Input, LabeledInput, Select } from '@/components/Input';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { datetime, money } from '@/components/format';

/** Admin › Products: catalogue (including hidden products) with inline stock editing. Low stock is text + colour. */
export function AdminProductsPage() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'products'], queryFn: () => get<Product[]>('/admin/products') });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin', 'products'] }); qc.invalidateQueries({ queryKey: ['products'] }); };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', description: '', sizes: 'S,M,L,XL', price: '500', member_price: '400', stock: '10' });
  const close = () => setOpen(false);
  const create = useMutation({
    mutationFn: () => {
      // Duplicate sizes would hit UNIQUE(product_id, size) and surface as a bare 500.
      const sizes = [...new Set(f.sizes.split(',').map((s) => s.trim()).filter(Boolean))];
      if (!sizes.length) throw new Error('Enter at least one size.');
      return post('/admin/products', { name: f.name, description: f.description || undefined, variants: sizes.map((size) => ({ size, price: Number(f.price), member_price: Number(f.member_price), stock: Number(f.stock) })) });
    },
    onSuccess: () => { setF({ ...f, name: '', description: '' }); setOpen(false); refresh(); toast.success('Product created'); },
  });
  const openNew = () => { create.reset(); setOpen(true); };
  const stock = useMutation({ mutationFn: ({ id, stock }: { id: number; stock: number }) => patch(`/admin/variants/${id}`, { stock }), onSuccess: () => { refresh(); toast.success('Stock updated'); }, onError: (e: any) => toast.error('Stock update failed', e.message) });
  /** Validate before saving; a cleared field must not become stock 0, and stock can't drop below what open orders have reserved. */
  const saveStock = (input: HTMLInputElement, v: Product['variants'][number]) => {
    const raw = input.value.trim(); const n = Number(raw);
    const revert = () => { input.value = String(v.stock); };
    if (raw === '' || !Number.isInteger(n) || n < 0) return revert();
    if (n === Number(v.stock)) return;
    if (n < Number(v.reserved)) { revert(); return toast.error('Stock too low', `${v.reserved} units of size ${v.size} are reserved by open orders.`); }
    stock.mutate({ id: v.id, stock: n }, { onError: revert });
  };
  return (
    <>
      <PageHeader eyebrow="Merchandise" script="products" title="& Stock" actions={<Button onClick={openNew} icon={<Plus className="size-4" aria-hidden />}>New product</Button>} />
      {q.isLoading ? <div className="card"><Skeleton rows={5} /></div> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="No products yet" action={<Button onClick={openNew}>Add the first product</Button>} /> : (
        <div className="space-y-4">
          {q.data.map((p) => (
            <section key={p.id} className="card" aria-labelledby={`p-${p.id}`}>
              <SectionHeader title={<span id={`p-${p.id}`}>{p.name}</span>} meta={p.is_active ? undefined : 'inactive'} />
              <DataTable rows={p.variants} rowKey={(v) => v.id} caption={`${p.name} stock by size`} className="!border-0 !bg-transparent"
                columns={[
                  // Phones: one compact card per size (size + prices/stock line, available, the stock field).
                  { key: 'size', header: 'Size', mobile: 'primary', render: (v) => <span className="flex items-center gap-3"><span className="card-sunken inline-flex min-h-9 min-w-9 items-center justify-center whitespace-nowrap px-2.5 text-xs font-semibold"><span className="sr-only">Size </span>{v.size}</span><span className="t-caption t-num md:hidden">{money(v.price)} / {money(v.member_price)} · stock {v.stock} · {v.reserved} held</span></span> },
                  { key: 'price', header: 'Price / member', align: 'right', hideOnMobile: true, render: (v) => <span className="t-num">{money(v.price)} <span className="text-text-tertiary">/</span> {money(v.member_price)}</span> },
                  { key: 'stock', header: 'Stock', align: 'right', hideOnMobile: true, render: (v) => <span className="t-num">{v.stock}</span> },
                  { key: 'reserved', header: 'Reserved', align: 'right', hideOnMobile: true, render: (v) => <span className="t-num text-text-secondary">{v.reserved}</span> },
                  { key: 'available', header: 'Available', align: 'right', mobile: 'status', render: (v) => <span className={`t-num font-medium ${v.available === 0 ? 'text-danger' : v.available < 5 ? 'text-warning' : ''}`}>{v.available}<span className="t-caption font-normal md:hidden"> available</span>{v.available < 5 && <span className="block t-caption font-normal">{v.available === 0 ? 'out' : 'low'}</span>}</span> },
                  { key: 'set', header: 'Set stock', align: 'right', mobile: 'actions', render: (v) => <div className="flex items-center gap-3 md:block"><label className="t-label shrink-0 md:sr-only" htmlFor={`st-${v.id}`}>Set stock<span className="sr-only"> for size {v.size}</span></label><input key={v.stock} id={`st-${v.id}`} type="number" inputMode="numeric" enterKeyHint="done" min={0} step={1} className="input text-right md:!w-24" defaultValue={v.stock} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} onBlur={(e) => saveStock(e.currentTarget, v)} /></div> },
                ]} />
            </section>
          ))}
        </div>
      )}
      <Modal open={open} onClose={close} variant="drawer" size="lg" title="New product" description="One variant is created per size with the same price and stock; adjust stock per size afterwards."
        footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button form="prod-form" type="submit" loading={create.isPending}>Create product</Button></>}>
        {/* One column on phones, two from lg; the Create button sits in the sheet's pinned footer. */}
        <form id="prod-form" className="grid gap-4 lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <LabeledInput label="Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <LabeledInput label="Sizes (comma-separated)" required autoCapitalize="characters" value={f.sizes} onChange={(e) => setF({ ...f, sizes: e.target.value })} />
          <LabeledInput label="Description" className="lg:col-span-2" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
            <LabeledInput label="Price ₹" type="number" inputMode="decimal" min="0" step="0.01" required value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
            <LabeledInput label="Member ₹" type="number" inputMode="decimal" min="0" step="0.01" required value={f.member_price} onChange={(e) => setF({ ...f, member_price: e.target.value })} />
            <LabeledInput label="Stock / size" type="number" inputMode="numeric" min="0" step="1" required value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} />
          </div>
          <ErrorState error={create.error} className="lg:col-span-2" />
        </form>
      </Modal>
    </>
  );
}

/** Allowed admin transitions (mirrors the API): pending → paid → fulfilled, and anything but cancelled → cancelled. */
const NEXT: Record<OrderStatus, OrderStatus[]> = { pending: ['paid', 'cancelled'], paid: ['fulfilled', 'cancelled'], fulfilled: ['cancelled'], cancelled: [] };
const LABEL: Record<OrderStatus, string> = { pending: 'Pending', paid: 'Paid', fulfilled: 'Fulfilled', cancelled: 'Cancelled' };
const PAGE_SIZE = 20;

/**
 * Admin › Orders. Live: subscribes to GET /admin/orders/stream (SSE) and, on each `order` event, refetches the
 * table and briefly highlights the row. If the stream drops it falls back to polling every 10 s until it reconnects.
 */
export function AdminOrdersPanel() {
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ status: '', q: '', page: 1 });
  const [live, setLive] = useState<'connecting' | 'live' | 'polling'>('connecting');
  const [flash, setFlash] = useState<number[]>([]);
  const [cancel, setCancel] = useState<AdminOrderRow | null>(null);
  const timers = useRef<number[]>([]);
  const qs = new URLSearchParams({ page: String(f.page), page_size: String(PAGE_SIZE), ...(f.status ? { status: f.status } : {}), ...(f.q.trim() ? { q: f.q.trim() } : {}) }).toString();
  const q = useQuery({
    queryKey: ['admin', 'orders', qs], queryFn: () => get<AdminOrdersPage>(`/admin/orders?${qs}`),
    placeholderData: (prev) => prev, refetchInterval: live === 'live' ? false : 10_000,
  });

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const es = new EventSource(`/api/admin/orders/stream?token=${encodeURIComponent(token)}`);
    es.onopen = () => setLive('live');
    es.onerror = () => setLive('polling'); // EventSource keeps retrying; onopen flips it back to live
    es.addEventListener('order', (ev) => {
      let id: number | null = null;
      try { id = Number(JSON.parse((ev as MessageEvent).data).id) || null; } catch { /* malformed event: still refetch */ }
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
      if (id == null) return;
      setFlash((l) => [...l, id!]);
      timers.current.push(window.setTimeout(() => setFlash((l) => l.filter((x) => x !== id)), 2500));
    });
    return () => { es.close(); timers.current.forEach(clearTimeout); };
  }, [qc]);

  const update = useMutation({
    mutationFn: ({ id, status }: { id: number; status: OrderStatus }) => patch<AdminOrderRow>(`/admin/orders/${id}`, { status }),
    onSuccess: (r) => { setCancel(null); qc.invalidateQueries({ queryKey: ['admin', 'orders'] }); qc.invalidateQueries({ queryKey: ['admin', 'products'] }); toast.success(`Order #${r.id} ${LABEL[r.status].toLowerCase()}`); },
    onError: (e: Error) => toast.error('Could not update order', e.message),
  });
  const change = (o: AdminOrderRow, status: OrderStatus) => (status === 'cancelled' ? setCancel(o) : update.mutate({ id: o.id, status }));
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader eyebrow="Merchandise" script="club" title="Orders" description="New orders and status changes appear here as they happen."
        actions={<span className={`badge ${live === 'live' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`} role="status"><Radio className="size-3" aria-hidden />{live === 'live' ? 'Live' : live === 'connecting' ? 'Connecting…' : 'Refreshing every 10 s'}</span>} />
      {/* Search on top, then the status filter as a sideways-scrolling chip row (one row on any phone). */}
      <div className="mb-4 space-y-3" role="search">
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" aria-hidden /><label htmlFor="oq" className="sr-only">Search orders</label><Input id="oq" type="search" enterKeyHint="search" className="!pl-10" placeholder="Customer name or email" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} /></div>
        <div role="group" aria-label="Order status" className="scroll-row fade-x -mx-4 gap-2 px-4 md:mx-0 md:px-0 md:[mask-image:none]">
          {(['', ...Object.keys(LABEL)] as (OrderStatus | '')[]).map((k) => <button key={k || 'any'} type="button" className="chip" aria-pressed={f.status === k} onClick={() => setF({ ...f, status: k, page: 1 })}>{k ? LABEL[k] : 'All'}</button>)}
        </div>
      </div>
      <DataTable rows={q.data?.rows} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} rowKey={(o) => o.id} caption="Merchandise orders"
        rowClassName={(o) => `transition-colors duration-700 ${flash.includes(o.id) ? '!bg-accent-soft' : ''}`}
        empty={<EmptyState title={f.q || f.status ? 'No orders match' : 'No orders yet'} />}
        columns={[
          { key: 'id', header: 'Order #', mobile: 'primary', className: 'whitespace-nowrap', render: (o) => <span className="font-mono">#{o.id}</span> },
          { key: 'date', header: 'Date', className: 'md:hidden lg:table-cell', render: (o) => <span className="whitespace-nowrap">{datetime(o.created_at)}</span>, hideOnMobile: true },
          { key: 'customer', header: 'Customer', mobile: 'primary', render: (o) => <><span className="font-medium">{o.customer.name}</span>{o.customer.is_member && <span className="ml-1.5 whitespace-nowrap t-label !text-success">member</span>}<span className="block t-caption [overflow-wrap:anywhere]">{o.customer.email}</span></> },
          { key: 'items', header: 'Items', render: (o) => <ul className="text-sm text-text-secondary">{o.items.map((i, n) => <li key={n}>{i.product} ({i.size}) × {i.qty}</li>)}</ul> },
          { key: 'total', header: 'Total', align: 'right', className: 'whitespace-nowrap', render: (o) => <span className="t-num font-medium">{money(o.total)}</span> },
          { key: 'payment', header: 'Payment', className: 'md:hidden lg:table-cell', render: (o) => <StatusBadge status={o.payment_status} />, hideOnMobile: true },
          { key: 'status', header: 'Status', mobile: 'status', render: (o) => <StatusBadge status={o.status} /> },
          { key: 'action', header: 'Action', mobile: 'actions', align: 'right', render: (o) => NEXT[o.status].length === 0 ? null : (
            <><label htmlFor={`os-${o.id}`} className="sr-only">Change status of order {o.id}</label>
            <Select id={`os-${o.id}`} className="md:!w-44" value="" disabled={update.isPending && update.variables?.id === o.id} onChange={(e) => e.target.value && change(o, e.target.value as OrderStatus)}>
              <option value="">Mark as…</option>{NEXT[o.status].map((s) => <option key={s} value={s}>{s === 'paid' ? 'Paid (cash received)' : LABEL[s]}</option>)}
            </Select></>
          ) },
        ]} />
      {q.data && q.data.total > PAGE_SIZE && (
        <nav className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm md:justify-end" aria-label="Order pages">
          <Button size="sm" variant="secondary" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>Previous</Button>
          <span className="t-caption">Page {f.page} of {pages} · {q.data.total} orders</span>
          <Button size="sm" variant="secondary" disabled={f.page >= pages} onClick={() => setF({ ...f, page: f.page + 1 })}>Next</Button>
        </nav>
      )}
      <Modal open={!!cancel} onClose={() => setCancel(null)} size="sm" title={`Cancel order #${cancel?.id ?? ''}?`}
        description={cancel?.status === 'pending' ? 'The reserved stock is released.' : 'The stock goes back on sale, the payment is marked refunded and a reversing ledger entry is written. Refund the money itself separately.'}
        footer={<><Button variant="secondary" onClick={() => setCancel(null)}>Keep order</Button><Button variant="danger" loading={update.isPending} onClick={() => cancel && update.mutate({ id: cancel.id, status: 'cancelled' })} icon={<XCircle className="size-4" aria-hidden />}>Cancel order</Button></>}>
        {cancel && <div className="card-sunken flex justify-between p-3 text-sm"><span>#{cancel.id} · {cancel.customer.name}</span><span className="t-num font-medium">{money(cancel.total)}</span></div>}
      </Modal>
    </>
  );
}
