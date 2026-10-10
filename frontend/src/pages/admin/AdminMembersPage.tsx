import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, UserRound, Wallet } from 'lucide-react';
import { get } from '@/api/client';
import type { Member } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { Input, Select } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { date } from '@/components/format';

/** Searchable member directory with a detail drawer. Renewal is a cash action, so it links to the treasurer desk. */
export function AdminMembersPage() {
  const { has } = useAuth();
  const [f, setF] = useState({ q: '', status: '', expiring: false });
  const [open, setOpen] = useState<Member | null>(null);
  const qs = new URLSearchParams({ ...(f.q ? { q: f.q } : {}), ...(f.status ? { status: f.status } : {}), ...(f.expiring ? { expiring_within_days: '14' } : {}) }).toString();
  const q = useQuery({ queryKey: ['members', qs], queryFn: () => get<Member[]>(`/members?${qs}`) });
  const days = (d: string | null) => d ? Math.ceil((+new Date(d) - Date.now()) / 86_400_000) : null;
  return (
    <>
      <PageHeader eyebrow="Members" title="Directory" description="Dues, expiry and renewal status for every profile." actions={<span className="t-label">{q.data?.length ?? 0} shown</span>} />
      <div className="card mb-4 flex flex-wrap items-center gap-2 !py-3" role="search">
        <div className="relative min-w-56 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" aria-hidden /><label htmlFor="mq" className="sr-only">Search members</label><Input id="mq" className="!pl-9" placeholder="Name, email or student ID" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <label htmlFor="ms" className="sr-only">Membership status</label>
        <Select id="ms" className="!w-auto" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Any status</option><option value="active">Active</option><option value="expired">Expired</option><option value="pending">Pending</option><option value="none">No membership</option></Select>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border-strong px-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"><input type="checkbox" className="accent-[var(--accent)]" checked={f.expiring} onChange={(e) => setF({ ...f, expiring: e.target.checked })} />Expiring in 14 days</label>
      </div>
      <DataTable rows={q.data} loading={q.isLoading} error={q.error} onRetry={() => q.refetch()} rowKey={(m) => m.id} caption="Members" empty={<EmptyState icon={<UserRound className="size-5" aria-hidden />} title="No members match" description="Try a different search or clear the filters." />}
        columns={[
          { key: 'name', header: 'Name', render: (m) => <button onClick={() => setOpen(m)} className="-my-1 inline-flex min-h-11 flex-col justify-center text-left font-medium hover:text-accent focus-ring rounded">{m.name}<span className="block t-caption font-mono md:hidden">{m.student_id}</span></button> },
          { key: 'sid', header: 'Student ID', render: (m) => <span className="font-mono text-xs">{m.student_id}</span>, hideOnMobile: true },
          { key: 'email', header: 'Email', render: (m) => <span className="text-text-secondary">{m.email}</span>, hideOnMobile: true },
          { key: 'status', header: 'Membership', render: (m) => <StatusBadge status={m.membership_status} /> },
          { key: 'exp', header: 'Expires', render: (m) => { const d = days(m.expiry_date); return <span className={d != null && d <= 14 && d >= 0 ? 'text-warning' : ''}>{date(m.expiry_date)}{d != null && d >= 0 && d <= 14 && <span className="block t-caption">in {d}d</span>}</span>; } },
          { key: 'joined', header: 'Joined', render: (m) => date((m as any).joined_at), hideOnMobile: true },
        ]} />
      <Modal open={!!open} onClose={() => setOpen(null)} variant="drawer" title={open?.name ?? ''} description={open?.email}
        footer={<>{has('treasurer') && open?.membership_status !== 'active' && <Link to="/treasurer/cash" className="btn-primary"><Wallet className="size-4" aria-hidden />Record dues</Link>}<button className="btn-secondary" onClick={() => setOpen(null)}>Close</button></>}>
        {open && (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="t-label">Student ID</dt><dd className="mt-0.5 font-mono">{open.student_id}</dd></div>
            <div><dt className="t-label">Role</dt><dd className="mt-0.5 capitalize">{open.role}</dd></div>
            <div><dt className="t-label">Phone</dt><dd className="mt-0.5">{open.phone || '—'}</dd></div>
            <div><dt className="t-label">Joined</dt><dd className="mt-0.5">{date((open as any).joined_at)}</dd></div>
            <div><dt className="t-label">Membership</dt><dd className="mt-1"><StatusBadge status={open.membership_status} /></dd></div>
            <div><dt className="t-label">Expires</dt><dd className="mt-0.5">{date(open.expiry_date)}</dd></div>
            {!has('treasurer') && open.membership_status !== 'active' && <p className="col-span-2 t-caption">Renewals are recorded by the treasurer (cash) or paid online by the member.</p>}
          </dl>
        )}
      </Modal>
    </>
  );
}
