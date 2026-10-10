import type { ReactNode } from 'react';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export function EmptyState({ title, description, action, icon, className = '' }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={`card flex flex-col items-center justify-center text-center py-10 px-6 ${className}`}>
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-surface-elevated text-text-tertiary">{icon ?? <Inbox className="size-5" aria-hidden />}</div>
      <h3 className="t-section">{title}</h3>
      {description && <p className="mt-1 text-sm text-text-secondary max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className = '' }: { error: unknown; onRetry?: () => void; className?: string }) {
  const e = error as { message?: string; status?: number; details?: { fieldErrors?: Record<string, string[]> } } | null;
  if (!error) return null;
  const fields = e?.details?.fieldErrors ? Object.entries(e.details.fieldErrors) : [];
  return (
    <div role="alert" className={`rounded-[var(--radius-md)] border border-danger/40 bg-danger-soft p-3 text-sm text-danger flex gap-3 ${className}`}>
      <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0 flex-1">
        <div>{e?.message ?? String(error)}</div>
        {fields.length > 0 && <ul className="mt-1 text-xs opacity-90 list-disc pl-4">{fields.map(([k, v]) => <li key={k}><span className="font-mono">{k}</span>: {v.join(', ')}</li>)}</ul>}
      </div>
      {onRetry && <Button variant="ghost" size="sm" onClick={onRetry} icon={<RefreshCw className="size-3.5" aria-hidden />} className="!text-danger shrink-0">Retry</Button>}
    </div>
  );
}

/** Content-shaped loading placeholder. `rows` renders a list; `block` a single area. */
export function Skeleton({ rows = 3, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2.5 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton h-4" style={{ width: `${90 - (i % 3) * 18}%` }} />)}
    </div>
  );
}
