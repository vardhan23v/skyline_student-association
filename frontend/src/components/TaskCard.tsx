import { AlertTriangle, CalendarClock, UserRound } from 'lucide-react';
import type { Task } from '@/api/types';
import { date } from './format';

const cols: Task['status'][] = ['todo', 'doing', 'done'];

/** Kanban card. Owner and due date are first-class; overdue gets icon + text, not just colour. */
export function TaskCard({ task: t, canMove, onMove, pending }: { task: Task; canMove: boolean; onMove: (s: Task['status']) => void; pending?: boolean }) {
  return (
    <article className={`card !p-3.5 ${t.overdue ? 'border-danger/50' : ''}`} aria-label={t.title}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium leading-snug">{t.title}</h4>
        {t.overdue && <span className="badge bg-danger-soft text-danger shrink-0"><AlertTriangle className="size-3" aria-hidden />overdue</span>}
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 t-caption">
        <div className="inline-flex items-center gap-1"><dt className="sr-only">Owner</dt><UserRound className="size-3" aria-hidden /><dd>{t.assignee_name ?? 'Unassigned'}</dd></div>
        <div className="inline-flex items-center gap-1"><dt className="sr-only">Due</dt><CalendarClock className="size-3" aria-hidden /><dd>{t.due_on ? date(t.due_on) : 'No due date'}</dd></div>
      </dl>
      {canMove && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={`Move "${t.title}"`}>
          {cols.filter((c) => c !== t.status).map((c) => (
            <button key={c} disabled={pending} onClick={() => onMove(c)} className="btn-secondary !min-h-9 !px-3 !text-xs capitalize">→ {c}</button>
          ))}
        </div>
      )}
    </article>
  );
}
