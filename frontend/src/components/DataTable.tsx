import type { ReactNode } from 'react';
import { useMediaQuery } from '@/hooks/useCursorFollow';
import { EmptyState, ErrorState, Skeleton } from './EmptyState';

/**
 * Where a column goes in the phone card (under 768px):
 * - `primary`: the card title (several stack, the first one largest), e.g. order # and customer
 * - `secondary` (default): a label/value row
 * - `status`: top right, beside the title (StatusBadge)
 * - `actions`: the bottom of the card, full width
 * `hideOnMobile` drops the column from the card and from the table under md.
 */
export type Column<T> = { key: string; header: ReactNode; render: (row: T) => ReactNode; className?: string; hideOnMobile?: boolean; align?: 'left' | 'right'; mobile?: 'primary' | 'secondary' | 'status' | 'actions' };

type Props<T> = { columns: Column<T>[]; rows: T[] | undefined; rowKey: (row: T) => string | number; loading?: boolean; error?: unknown; onRetry?: () => void; empty?: ReactNode; stack?: boolean; className?: string; caption?: string; rowClassName?: (row: T) => string };

const blank = (n: ReactNode) => n == null || n === false || n === '';

/**
 * Data table. From md up it's a normal table; if the columns don't fit, it scrolls sideways inside its card with
 * the first column pinned. Under md (with `stack`, the default) each row is a card instead, laid out from each
 * column's `mobile` slot. Only one of the two is rendered, so ids inside cells stay unique.
 */
export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, empty, stack = true, className = '', caption, rowClassName }: Props<T>) {
  const wide = useMediaQuery('(min-width: 768px)');
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading && !rows) return <div className="card"><Skeleton rows={5} /></div>;
  if (!rows?.length) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;

  if (stack && !wide) {
    const shown = columns.filter((c) => !c.hideOnMobile);
    const slot = (s: NonNullable<Column<T>['mobile']>) => shown.filter((c) => (c.mobile ?? 'secondary') === s);
    // A table with no declared title uses its first column.
    const primary = slot('primary').length ? slot('primary') : shown.slice(0, 1);
    const secondary = slot('secondary').filter((c) => !primary.includes(c));
    return (
      <ul className={`space-y-2.5 ${className}`} aria-label={caption}>
        {rows.map((r) => {
          const pairs = secondary.map((c) => [c, c.render(r)] as const).filter(([, v]) => !blank(v));
          const actions = slot('actions').map((c) => [c, c.render(r)] as const).filter(([, v]) => !blank(v));
          return (
            <li key={rowKey(r)} className={`dt-card ${rowClassName?.(r) ?? ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">{primary.map((c, i) => <div key={c.key} className={i === 0 ? 'text-base font-medium' : 'text-sm'}>{c.render(r)}</div>)}</div>
                {slot('status').length > 0 && <div className="flex shrink-0 flex-col items-end gap-1">{slot('status').map((c) => <div key={c.key}>{c.render(r)}</div>)}</div>}
              </div>
              {pairs.length > 0 && <dl className="mt-2 text-sm">{pairs.map(([c, v]) => <div key={c.key}><dt>{c.header}</dt><dd>{v}</dd></div>)}</dl>}
              {actions.length > 0 && <div className="dt-actions mt-3 flex flex-col gap-2">{actions.map(([c, v]) => <div key={c.key}>{v}</div>)}</div>}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className={`card !p-0 overflow-hidden ${className}`}>
      <div className="overflow-x-auto scrollbar-thin">
        <table className={`table table-pin ${stack ? '' : 'min-w-[640px]'}`}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead><tr>{columns.map((c, i) => <th key={c.key} scope="col" className={`${i === 0 ? 'pl-5' : ''} ${c.hideOnMobile ? 'hidden md:table-cell' : ''} ${c.align === 'right' ? 'text-right' : ''} ${c.className ?? ''}`}>{c.header}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className={rowClassName?.(r)}>
                {columns.map((c, i) => <td key={c.key} className={`${i === 0 ? 'pl-5' : ''} ${i === columns.length - 1 ? 'pr-5' : ''} ${c.hideOnMobile ? 'hidden md:table-cell' : ''} ${c.align === 'right' ? 'text-right' : ''} ${c.className ?? ''}`}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
