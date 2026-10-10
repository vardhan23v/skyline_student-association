import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { LedgerRow } from '@/api/types';
import { datetime, money } from './format';

/** Ledger line for feeds and the finance page. Direction is icon + sign + colour. */
export function TransactionRow({ row: r, action }: { row: LedgerRow; action?: React.ReactNode }) {
  const isIn = r.direction === 'in';
  return (
    <li className="flex items-center gap-3 py-3 border-b border-border last:border-0 min-w-0">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${isIn ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`} aria-hidden>
        {isIn ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{r.memo || r.category}</div>
        <div className="truncate t-caption font-mono">{datetime(r.occurred_at)} · {r.category} · {r.source_type}#{r.source_id}{r.event_title ? ` · ${r.event_title}` : r.fundraiser_name ? ` · ${r.fundraiser_name}` : ''}</div>
      </div>
      <div className={`shrink-0 text-sm font-medium t-num ${isIn ? 'text-success' : 'text-danger'}`}><span className="sr-only">{isIn ? 'Income' : 'Expense'} </span>{isIn ? '+' : '−'}{money(r.amount)}</div>
      {action}
    </li>
  );
}
