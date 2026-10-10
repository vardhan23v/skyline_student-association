import type { ReactNode } from 'react';
import { EmptyState, ErrorState, Skeleton } from './EmptyState';

export type Column<T> = { key: string; header: ReactNode; render: (row: T) => ReactNode; className?: string; /** Priority columns stay visible when stacked; others still render as labelled rows. */ hideOnMobile?: boolean; align?: 'left' | 'right' };

type Props<T> = { columns: Column<T>[]; rows: T[] | undefined; rowKey: (row: T) => string | number; loading?: boolean; error?: unknown; onRetry?: () => void; empty?: ReactNode; stack?: boolean; className?: string; caption?: string; rowClassName?: (row: T) => string };

/**
 * Table that becomes stacked labelled cards under 768px (`stack`, default on).
 * Each cell carries `data-label` so the mobile layout needs no duplicate markup.
 */
export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, empty, stack = true, className = '', caption, rowClassName }: Props<T>) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading && !rows) return <div className="card"><Skeleton rows={5} /></div>;
  if (!rows?.length) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return (
    <div className={`card !p-0 overflow-hidden ${className}`}>
      <div className="overflow-x-auto scrollbar-thin md:px-5">
        <table className={`table ${stack ? 'table-stack p-3 md:p-0' : 'min-w-[640px]'}`}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={`${c.hideOnMobile ? 'hidden md:table-cell' : ''} ${c.align === 'right' ? 'text-right' : ''} ${c.className ?? ''}`}>{c.header}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className={rowClassName?.(r)}>
                {columns.map((c) => <td key={c.key} data-label={typeof c.header === 'string' ? c.header : ''} className={`${c.hideOnMobile ? 'hidden md:table-cell' : ''} ${c.align === 'right' ? 'md:text-right' : ''} ${c.className ?? ''}`}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
