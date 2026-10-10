import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Undo2 } from 'lucide-react';
import { get, post } from '@/api/client';
import type { LedgerRow } from '@/api/types';
import { getToken } from '@/auth/token';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/Button';
import { LabeledInput, LabeledSelect, LabeledTextarea } from '@/components/Input';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { datetime, money } from '@/components/format';

/** Append-only ledger. Reversal is a designed destructive step: modal with a required memo. */
export function LedgerPage() {
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ from: '', to: '', category: '' });
  const [rev, setRev] = useState<LedgerRow | null>(null); const [memo, setMemo] = useState('');
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const q = useQuery({ queryKey: ['ledger', qs], queryFn: () => get<LedgerRow[]>(`/admin/finance/ledger?${qs}`) });
  const reverse = useMutation({ mutationFn: ({ id, memo }: { id: number; memo: string }) => post(`/admin/finance/ledger/${id}/reverse`, { memo }), onSuccess: () => { setRev(null); setMemo(''); qc.invalidateQueries(); toast.success('Reversal recorded'); } });
  const openReverse = (r: LedgerRow) => { setMemo(''); reverse.reset(); setRev(r); };
  const closeReverse = () => setRev(null);
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      // No `limit`: the API returns every row for CSV (the JSON view is capped at 500).
      const p = new URLSearchParams(qs); p.set('format', 'csv');
      const res = await fetch(`/api/admin/finance/ledger?${p}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) { const body = await res.json().catch(() => null); throw new Error(body?.error ?? `Export failed (${res.status})`); }
      const url = URL.createObjectURL(await res.blob());
      // Firefox needs the anchor in the document, and revoking synchronously can cancel the download.
      const a = document.createElement('a'); a.href = url; a.download = 'ledger.csv'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success('CSV downloaded');
    }
    catch (e: any) { toast.error('Export failed', e.message); } finally { setExporting(false); }
  };
  const totals = (q.data ?? []).reduce((a, r) => { a[r.direction] += Number(r.amount); return a; }, { in: 0, out: 0 });
  // Entries that already have a reversal in view: the server rejects a second reversal (409), so don't offer it.
  const reversed = new Set((q.data ?? []).filter((r) => r.source_type === 'reversal').map((r) => Number(r.source_id)));
  return (
    <>
      <PageHeader eyebrow="Finance" title="Ledger" description="Append-only. Mistakes are fixed with reversing entries, never edits." actions={<Button variant="secondary" onClick={exportCsv} loading={exporting} icon={<Download className="size-4" aria-hidden />}>Export CSV</Button>} />
      <div className="card mb-4 flex flex-wrap items-end gap-2 !py-3">
        <LabeledInput label="From" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="!w-40" />
        <LabeledInput label="To" type="date" min={f.from || undefined} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="!w-40" />
        <LabeledSelect label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="!w-44"><option value="">All</option>{['dues', 'ticket', 'merch', 'fundraiser', 'reimbursement', 'other'].map((c) => <option key={c}>{c}</option>)}</LabeledSelect>
        <div className="ml-auto flex gap-4 t-caption"><span>{q.data?.length === 500 ? 'First 500 rows · CSV has all' : `${q.data?.length ?? 0} rows`}</span><span className="text-success t-num">+{money(totals.in)}</span><span className="text-danger t-num">−{money(totals.out)}</span></div>
      </div>
      <DataTable rows={q.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} rowKey={(r) => r.id} caption="Ledger entries" empty={<EmptyState title="No entries in this range" />}
        columns={[
          { key: 'id', header: '#', render: (r) => <span className="font-mono text-xs text-text-tertiary">{r.id}</span>, hideOnMobile: true },
          { key: 'when', header: 'When', render: (r) => <span className="whitespace-nowrap">{datetime(r.occurred_at)}</span> },
          { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className={`t-num font-medium ${r.direction === 'in' ? 'text-success' : 'text-danger'}`}><span className="sr-only">{r.direction === 'in' ? 'in' : 'out'} </span>{r.direction === 'in' ? '+' : '−'}{money(r.amount)}</span> },
          { key: 'cat', header: 'Category', render: (r) => <span className="capitalize">{r.category}</span> },
          { key: 'src', header: 'Source', render: (r) => <span className="font-mono text-xs">{r.source_type}#{r.source_id}</span>, hideOnMobile: true },
          { key: 'attr', header: 'Attributed to', render: (r) => <span className="text-text-secondary">{r.event_title ?? r.fundraiser_name ?? '—'}</span>, hideOnMobile: true },
          { key: 'memo', header: 'Memo', render: (r) => <span className="text-text-secondary">{r.memo}</span> },
          { key: 'by', header: 'By', render: (r) => <span className="text-text-secondary">{r.entered_by_name}</span>, hideOnMobile: true },
          { key: 'act', header: '', align: 'right', render: (r) => r.source_type === 'reversal' ? null : reversed.has(Number(r.id)) ? <span className="t-caption">Reversed</span> : <button className="btn-ghost !min-h-9 !px-2.5 !text-xs !text-danger" onClick={() => openReverse(r)}><Undo2 className="size-3.5" aria-hidden />Reverse</button> },
        ]} />
      <Modal open={!!rev} onClose={closeReverse} size="sm" title="Reverse this entry?" description="This appends an opposite entry. The original stays visible."
        footer={<><Button variant="secondary" onClick={closeReverse}>Cancel</Button><Button variant="danger" disabled={!memo.trim()} loading={reverse.isPending} onClick={() => rev && reverse.mutate({ id: rev.id, memo: memo.trim() })} icon={<Undo2 className="size-4" aria-hidden />}>Record reversal</Button></>}>
        {rev && <div className="space-y-4"><div className="card-sunken p-3 text-sm"><div className="flex justify-between"><span className="capitalize">{rev.category}</span><span className={`t-num font-medium ${rev.direction === 'in' ? 'text-success' : 'text-danger'}`}>{rev.direction === 'in' ? '+' : '−'}{money(rev.amount)}</span></div><div className="t-caption mt-1">{rev.memo}</div></div><LabeledTextarea label="Reason (required)" rows={3} maxLength={400} value={memo} onChange={(e) => setMemo(e.target.value)} autoFocus /><ErrorState error={reverse.error} /></div>}
      </Modal>
    </>
  );
}
