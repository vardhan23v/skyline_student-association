import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, IdCard, QrCode, Receipt } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

const tiles = [
  { to: '/volunteer/scan', t: 'Door scanner', d: 'Scan ticket QR codes at the entrance.', icon: QrCode },
  { to: '/volunteer/verify', t: 'Verify member', d: 'Check an active membership by student ID or QR.', icon: IdCard },
  { to: '/volunteer/tasks', t: 'Task board', d: 'Fundraiser tasks assigned to you and the team.', icon: ClipboardList },
  { to: '/volunteer/expenses/new', t: 'Submit expense', d: 'Upload a receipt for reimbursement.', icon: Receipt },
];
export function VolunteerHome() {
  return (
    <>
      <PageHeader eyebrow="Volunteer" title="Volunteer tools" description="Everything you need at the door and on the floor." />
      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((x) => (
          <Link key={x.to} to={x.to} className="card card-hover interactive group flex items-start gap-4 focus-ring">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent"><x.icon className="size-5" aria-hidden /></span>
            <span className="min-w-0 flex-1"><span className="t-section block">{x.t}</span><span className="t-caption mt-0.5 block">{x.d}</span></span>
            <ArrowRight className="size-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        ))}
      </div>
    </>
  );
}
