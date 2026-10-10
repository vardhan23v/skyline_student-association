import { Link } from 'react-router-dom';
import { PageTitle } from '@/components/ui';
const tiles = [
  { to: '/volunteer/scan', t: '📷 Door scanner', d: 'Scan ticket QR codes at the entrance.' },
  { to: '/volunteer/verify', t: '🪪 Verify member', d: 'Check an active membership by student ID or QR.' },
  { to: '/volunteer/tasks', t: '📋 Task board', d: 'Fundraiser tasks assigned to you and the team.' },
  { to: '/volunteer/expenses/new', t: '🧾 Submit expense', d: 'Upload a receipt for reimbursement.' },
];
export function VolunteerHome() {
  return (<><PageTitle title="Volunteer" /><div className="grid gap-4 sm:grid-cols-2">{tiles.map((x) => <Link key={x.to} to={x.to} className="card hover:shadow-md"><h3 className="font-semibold">{x.t}</h3><p className="text-sm text-slate-500 mt-1">{x.d}</p></Link>)}</div></>);
}
