import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, ChevronDown, Receipt, Wallet } from 'lucide-react';
import { get, patch, post } from '@/api/client';
import type { DuesOverview } from '@/api/types';
import { Button } from '@/components/Button';
import { DataTable, type Column } from '@/components/DataTable';
import { EmptyState, ErrorState, Skeleton } from '@/components/EmptyState';
import { MetricCard } from '@/components/MetricCard';
import { Modal } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/Toast';
import { date, datetime, money } from '@/components/format';

type RemindGroup = 'memberships_due' | 'unpaid_orders';
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A collapsible group: count and total in the header, its table inside. */
function Group({ title, count, total, children, actions, defaultOpen }: { title: string; count: number; total: number; children: ReactNode; actions?: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen ?? count > 0} className="group card !p-0 overflow-hidden">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden sm:px-5 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 shrink-0 text-text-tertiary transition-transform group-open:rotate-180" aria-hidden />
        <span className="t-section min-w-0 flex-1 truncate">{title}</span>
        <span className="t-label shrink-0">{count}</span>
        <span className="t-num shrink-0 font-medium">{money(total)}</span>
      </summary>
      <div className="border-t border-border p-3 sm:p-4">
        {actions && <div className="mb-3 flex flex-wrap items-center justify-end gap-2">{actions}</div>}
        {children}
      </div>
    </details>
  );
}

/** A row checkbox for the reminder groups. */
const pick = (selected: Set<number>, toggle: (id: number) => void, label: (id: number) => string): Column<{ id: number }> => ({
  key: 'pick', header: <span className="sr-only">Select</span>, mobile: 'actions',
  render: (r) => <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /><span className="md:sr-only">{label(r.id)}</span></label>,
});

/**
 * Admin › Finance › Who owes what (`/admin/finance?view=dues`): who owes the club (memberships due, unpaid orders and
 * tickets) and whom the club owes (approved reimbursements), all live from GET /admin/dues. Members and order holders
 * can be reminded (once per 24 hours each); reimbursements are paid out with the expense "Mark paid" action.
 */
export function DuesPanel() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'dues'], queryFn: () => get<DuesOverview>('/admin/dues'), refetchInterval: 60_000 });
  const [sel, setSel] = useState<Record<RemindGroup, Set<number>>>({ memberships_due: new Set(), unpaid_orders: new Set() });
  const [confirm, setConfirm] = useState<RemindGroup | null>(null);
  const [paying, setPaying] = useState<DuesOverview['reimbursements_owed']['rows'][number] | null>(null);
  const toggle = (g: RemindGroup) => (id: number) => setSel((s) => { const n = new Set(s[g]); if (n.has(id)) n.delete(id); else n.add(id); return { ...s, [g]: n }; });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin', 'dues'] }); qc.invalidateQueries({ queryKey: ['admin', 'overview'] }); };

  const remind = useMutation({
    mutationFn: (g: RemindGroup) => post<{ sent: number; skipped: number }>('/admin/dues/remind', { group: g, ids: [...sel[g]] }),
    onSuccess: (r, g) => {
      const parts = [r.sent && `Sent ${r.sent}`, r.skipped && `Skipped ${r.skipped}`].filter(Boolean).join(' · ');
      (r.sent ? toast.success : toast.error)(parts || 'Nothing sent', r.skipped ? 'One reminder per person per 24 hours.' : undefined);
      setSel((s) => ({ ...s, [g]: new Set() })); setConfirm(null); refresh();
    },
    onError: (e: Error) => toast.error('Could not send reminders', e.message),
  });
  const pay = useMutation({
    mutationFn: (id: number) => patch(`/admin/expenses/${id}/pay`),
    onSuccess: () => {
      toast.success('Marked paid', 'Ledger entry written.'); setPaying(null); refresh();
      for (const k of [['expenses'], ['ledger'], ['finance']]) qc.invalidateQueries({ queryKey: k });
    },
  });

  if (q.isLoading) return <div className="card"><Skeleton rows={6} /></div>;
  if (!q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const owedTo = d.memberships_due.count + d.unpaid_orders.count + d.unpaid_tickets.count;
  const remindButton = (g: RemindGroup) => (
    <Button size="sm" variant="secondary" disabled={!sel[g].size} onClick={() => setConfirm(g)} icon={<BellRing className="size-4" aria-hidden />}>
      Send reminder{sel[g].size ? ` (${sel[g].size})` : ''}
    </Button>
  );

  return (
    <>
      <PageHeader script="who owes" title="What" description={`Live from the database, as of ${date(d.as_of)}. Reminders go out at most once per person every 24 hours.`} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:gap-4">
        <MetricCard label="Owed to the club" icon={Wallet} value={money(d.totals.owed_to_club)} tone={d.totals.owed_to_club ? 'warning' : 'default'}
          hint={`${plural(d.memberships_due.count, 'membership')} · ${plural(d.unpaid_orders.count, 'order')} · ${plural(d.unpaid_tickets.count, 'ticket')}`} />
        <MetricCard label="Owed by the club" icon={Receipt} value={money(d.totals.owed_by_club)} tone={d.totals.owed_by_club ? 'danger' : 'default'}
          hint={plural(d.reimbursements_owed.count, 'reimbursement')} />
      </div>

      {owedTo === 0 && <EmptyState className="mb-4" icon={<Wallet className="size-5" aria-hidden />} title="Nobody owes the club anything" description="No memberships due, unpaid orders or unpaid tickets." />}
      <div className="space-y-4">
        {owedTo > 0 && <>
          <Group title="Memberships due" count={d.memberships_due.count} total={d.memberships_due.total_amount} actions={remindButton('memberships_due')}>
            <DataTable rows={d.memberships_due.rows} rowKey={(r) => r.id} caption="Memberships due" empty={<p className="t-caption">No memberships due.</p>}
              columns={[
                pick(sel.memberships_due, toggle('memberships_due'), () => 'Select for reminder') as Column<DuesOverview['memberships_due']['rows'][number]>,
                { key: 'who', header: 'Member', mobile: 'primary', render: (r) => <><span className="font-medium">{r.name}</span><span className="block t-caption">{r.email}</span></> },
                { key: 'status', header: 'Status', mobile: 'status', render: (r) => <StatusBadge status={r.status === 'expiring' ? 'pending' : r.status}>{r.status === 'pending' ? 'unpaid' : r.status}</StatusBadge> },
                { key: 'exp', header: 'Expiry', render: (r) => date(r.expiry_date) },
                { key: 'amt', header: 'Dues', align: 'right', render: (r) => <span className="t-num">{money(r.amount)}</span> },
                { key: 'rem', header: 'Last reminded', hideOnMobile: true, className: 'pl-6', render: (r) => <span className="t-caption">{r.reminded_at ? datetime(r.reminded_at) : '—'}</span> },
              ]} />
          </Group>
          <Group title="Unpaid orders" count={d.unpaid_orders.count} total={d.unpaid_orders.total_amount} actions={remindButton('unpaid_orders')}>
            <DataTable rows={d.unpaid_orders.rows} rowKey={(r) => r.id} caption="Unpaid orders" empty={<p className="t-caption">No unpaid orders.</p>}
              columns={[
                pick(sel.unpaid_orders, toggle('unpaid_orders'), () => 'Select for reminder') as Column<DuesOverview['unpaid_orders']['rows'][number]>,
                { key: 'id', header: 'Order', mobile: 'primary', render: (r) => <><span className="font-medium">#{r.id} · {r.name}</span><span className="block t-caption">{r.email}</span></> },
                { key: 'total', header: 'Total', align: 'right', render: (r) => <span className="t-num">{money(r.amount)}</span> },
                { key: 'placed', header: 'Placed', render: (r) => datetime(r.created_at) },
                { key: 'hold', header: 'Hold', mobile: 'status', render: (r) => r.minutes_left > 0 ? <StatusBadge status="pending">{r.minutes_left} min left</StatusBadge> : <StatusBadge status="expired">releasing</StatusBadge> },
              ]} />
          </Group>
          <Group title="Unpaid tickets" count={d.unpaid_tickets.count} total={d.unpaid_tickets.total_amount}>
            <DataTable rows={d.unpaid_tickets.rows} rowKey={(r) => r.id} caption="Unpaid tickets" empty={<p className="t-caption">No unpaid tickets.</p>}
              columns={[
                { key: 'who', header: 'Holder', mobile: 'primary', render: (r) => <><span className="font-medium">{r.name}</span><span className="block t-caption">{r.event_title} · ticket #{r.id}</span></> },
                { key: 'price', header: 'Price', align: 'right', render: (r) => <span className="t-num">{money(r.amount)}</span> },
                { key: 'when', header: 'Started', render: (r) => datetime(r.created_at) },
              ]} />
          </Group>
        </>}
        <Group title="Reimbursements owed" count={d.reimbursements_owed.count} total={d.reimbursements_owed.total_amount} defaultOpen>
          <DataTable rows={d.reimbursements_owed.rows} rowKey={(r) => r.id} caption="Reimbursements owed"
            empty={<EmptyState icon={<Receipt className="size-5" aria-hidden />} title="No reimbursements pending" description="Approved expenses show here until they're paid out." />}
            columns={[
              { key: 'who', header: 'Submitted by', mobile: 'primary', render: (r) => <><span className="font-medium">{r.submitter ?? '—'}</span><span className="block t-caption">#{r.id} · {r.description || r.category}</span></> },
              { key: 'amt', header: 'Amount', align: 'right', render: (r) => <span className="t-num font-medium">{money(r.amount)}</span> },
              { key: 'ok', header: 'Approved', render: (r) => datetime(r.approved_at) },
              { key: 'rec', header: 'Receipt', render: (r) => r.receipt_url ? <a href={r.receipt_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Open receipt</a> : <span className="t-caption">none</span> },
              { key: 'pay', header: <span className="sr-only">Actions</span>, mobile: 'actions', align: 'right', render: (r) => <Button size="sm" onClick={() => setPaying(r)} icon={<Wallet className="size-4" aria-hidden />}>Mark paid → ledger</Button> },
            ]} />
        </Group>
      </div>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Send reminders?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button><Button loading={remind.isPending} onClick={() => confirm && remind.mutate(confirm)} icon={<BellRing className="size-4" aria-hidden />}>Send</Button></>}>
        {confirm && <p className="text-sm text-text-secondary">
          Email {plural(sel[confirm].size, 'person', 'people')} a short reminder to {confirm === 'memberships_due' ? 'renew their membership' : 'complete their order'}, with a link to their account. Anyone reminded in the last 24 hours is skipped.
        </p>}
      </Modal>
      <Modal open={!!paying} onClose={() => { setPaying(null); pay.reset(); }} title="Mark reimbursement paid?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setPaying(null)}>Cancel</Button><Button loading={pay.isPending} onClick={() => paying && pay.mutate(paying.id)} icon={<Wallet className="size-4" aria-hidden />}>Mark paid</Button></>}>
        {paying && <div className="space-y-2 text-sm text-text-secondary">
          <p>Confirm that {money(paying.amount)} was handed to {paying.submitter ?? 'the submitter'} for “{paying.description || paying.category}”.</p>
          <p>This writes an outgoing ledger entry and can only be undone with a reversal.</p>
          <ErrorState error={pay.error} />
        </div>}
      </Modal>
    </>
  );
}
