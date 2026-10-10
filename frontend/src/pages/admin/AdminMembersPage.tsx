import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/api/client';
import type { Member } from '@/api/types';
import { Badge, PageTitle, date } from '@/components/ui';

export function AdminMembersPage() {
  const [f, setF] = useState({ q: '', status: '', expiring: false });
  const qs = new URLSearchParams({ ...(f.q ? { q: f.q } : {}), ...(f.status ? { status: f.status } : {}), ...(f.expiring ? { expiring_within_days: '14' } : {}) }).toString();
  const q = useQuery({ queryKey: ['members', qs], queryFn: () => get<Member[]>(`/members?${qs}`) });
  return (
    <>
      <PageTitle title="Members" sub="Dues, expiry and renewal status." />
      <div className="card mb-4 flex flex-wrap gap-2 items-center">
        <input className="input !w-64" placeholder="Search name / email / student ID" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select className="input !w-auto" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Any status</option><option value="active">Active</option><option value="expired">Expired</option><option value="pending">Pending</option><option value="none">No membership</option></select>
        <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={f.expiring} onChange={(e) => setF({ ...f, expiring: e.target.checked })} /> Expiring in 14 days</label>
        <span className="text-sm text-slate-500 ml-auto">{q.data?.length ?? 0} members</span>
      </div>
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Name</th><th>Student ID</th><th>Email</th><th>Phone</th><th>Membership</th><th>Expires</th><th>Joined</th></tr></thead><tbody>
        {q.data?.map((m) => <tr key={m.id}><td>{m.name}</td><td>{m.student_id}</td><td>{m.email}</td><td>{m.phone}</td><td><Badge s={m.membership_status} /></td><td>{date(m.expiry_date)}</td><td>{date((m as any).joined_at)}</td></tr>)}
      </tbody></table></div>
    </>
  );
}
