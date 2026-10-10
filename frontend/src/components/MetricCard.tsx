import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';

type Props = { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; trend?: { value: number; label?: string }; loading?: boolean; tone?: 'default' | 'accent' | 'warning' | 'danger'; className?: string };

/** Compact stat tile: label top-left in mono caps, big tabular number, optional trend. */
export function MetricCard({ label, value, hint, icon: Icon, trend, loading, tone = 'default', className = '' }: Props) {
  const toneText = tone === 'accent' ? 'text-accent' : tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-text-primary';
  return (
    <div className={`card flex flex-col gap-3 min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="t-label">{label}</span>
        {Icon && <Icon className="size-4 text-text-tertiary shrink-0" aria-hidden />}
      </div>
      {loading ? <div className="skeleton h-9 w-24" aria-label="Loading" /> : <div className={`t-metric truncate ${toneText}`}>{value}</div>}
      {(hint || trend) && (
        <div className="flex items-center gap-2 t-caption min-w-0">
          {trend && (
            <span className={`inline-flex items-center gap-0.5 font-mono text-[11px] ${trend.value >= 0 ? 'text-success' : 'text-danger'}`}>
              {trend.value >= 0 ? <ArrowUpRight className="size-3" aria-hidden /> : <ArrowDownRight className="size-3" aria-hidden />}
              {Math.abs(trend.value)}%{trend.label ? ` ${trend.label}` : ''}
            </span>
          )}
          {hint && <span className="truncate">{hint}</span>}
        </div>
      )}
    </div>
  );
}
