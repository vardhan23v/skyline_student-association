import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Upload } from 'lucide-react';
import { get, post } from '@/api/client';
import type { Event, Expense, Fundraiser } from '@/api/types';
import { PageHeader, SectionHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/Button';
import { Field, LabeledInput, LabeledSelect } from '@/components/Input';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { useToast } from '@/components/Toast';
import { money } from '@/components/format';

/** Receipt (≤5 MB jpeg/png/pdf) is base64-encoded into the JSON body; the server hashes it for duplicate detection. */
const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

export function SubmitExpensePage() {
  const toast = useToast(); const qc = useQueryClient();
  const events = useQuery({ queryKey: ['admin', 'events'], queryFn: () => get<Event[]>('/admin/events') });
  const frs = useQuery({ queryKey: ['fundraisers'], queryFn: () => get<Fundraiser[]>('/admin/fundraisers') });
  const mine = useQuery({ queryKey: ['expenses', 'mine'], queryFn: () => get<Expense[]>('/admin/expenses?mine=true') });
  const [f, setF] = useState({ amount: '', category: 'supplies', description: '', event_id: '', fundraiser_id: '' });
  const [file, setFile] = useState<File | null>(null);
  const submit = useMutation({
    mutationFn: async () => {
      let receipt_base64: string | undefined, receipt_mime: string | undefined;
      if (file) { if (!RECEIPT_TYPES.includes(file.type)) throw new Error('Receipt must be a JPEG, PNG or PDF file.'); if (file.size > 5 * 1024 * 1024) throw new Error('Receipt exceeds 5 MB'); receipt_mime = file.type; receipt_base64 = btoa(new Uint8Array(await file.arrayBuffer()).reduce((s, b) => s + String.fromCharCode(b), '')); }
      return post<Expense>('/admin/expenses', { amount: Number(f.amount), category: f.category, description: f.description || undefined, event_id: f.event_id ? Number(f.event_id) : undefined, fundraiser_id: f.fundraiser_id ? Number(f.fundraiser_id) : undefined, receipt_base64, receipt_mime });
    },
    onSuccess: (x) => { setF({ amount: '', category: 'supplies', description: '', event_id: '', fundraiser_id: '' }); setFile(null); qc.invalidateQueries({ queryKey: ['expenses'] }); toast.success(`Submitted #${x.id}`, x.flags.length ? `Flagged for review: ${x.flags.map((y) => y.code).join(', ')}` : 'Another admin will review it.'); },
  });
  return (
    <>
      <PageHeader eyebrow="Reimbursements" script="submit" title="Expense" description="Attach the receipt. Another admin reviews it, then marks it paid." />
      <div className="grid gap-5 lg:grid-cols-5">
        <form className="card space-y-4 lg:col-span-2" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
          <LabeledInput label="Amount (₹)" type="number" inputMode="decimal" enterKeyHint="next" min="1" step="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <LabeledSelect label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{['supplies', 'food', 'venue', 'printing', 'decor', 'transport', 'other'].map((c) => <option key={c}>{c}</option>)}</LabeledSelect>
          <LabeledInput label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <LabeledSelect label="Linked event (optional)" value={f.event_id} onChange={(e) => setF({ ...f, event_id: e.target.value })}><option value="">—</option>{events.data?.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</LabeledSelect>
          <LabeledSelect label="Linked fundraiser (optional)" value={f.fundraiser_id} onChange={(e) => setF({ ...f, fundraiser_id: e.target.value })}><option value="">—</option>{frs.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</LabeledSelect>
          <Field label="Receipt" hint="jpeg, png or pdf · up to 5 MB. Amounts over ₹200 without a receipt are flagged." htmlFor="receipt">
            <label htmlFor="receipt" className={`card-sunken flex min-h-12 cursor-pointer items-center gap-3 border-dashed p-3 text-sm ${file ? 'border-success/50' : ''}`}>
              <Upload className="size-4 shrink-0 text-text-tertiary" aria-hidden /><span className="truncate">{file ? file.name : 'Take a photo or choose a file…'}</span>
              <input id="receipt" type="file" className="sr-only" accept="image/jpeg,image/png,application/pdf" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; /* lets the same file be picked again after a submit */ }} />
            </label>
          </Field>
          <ErrorState error={submit.error} />
          <Button type="submit" className="w-full" loading={submit.isPending} icon={<Receipt className="size-4" aria-hidden />}>Submit</Button>
        </form>
        <section className="lg:col-span-3">
          <SectionHeader title="My expenses" meta={mine.data ? `${mine.data.length}` : undefined} />
          <DataTable rows={mine.data} loading={mine.isLoading} error={mine.error} onRetry={() => mine.refetch()} rowKey={(x) => x.id} caption="Your submitted expenses" empty={<EmptyState title="No expenses yet" description="Submitted expenses and their review status show here." />}
            columns={[
              { key: 'id', header: 'Ref', mobile: 'primary', render: (x) => <span className="font-mono">#{x.id}</span> },
              { key: 'amount', header: 'Amount', render: (x) => <span className="t-num font-medium">{money(x.amount)}</span>, align: 'right' },
              { key: 'what', header: 'What', render: (x) => <><span>{x.description ?? x.category}</span>{x.review_note && <span className="block t-caption">Note: {x.review_note}</span>}</> },
              { key: 'status', header: 'Status', mobile: 'status', render: (x) => <StatusBadge status={x.status} /> },
            ]} />
        </section>
      </div>
    </>
  );
}
