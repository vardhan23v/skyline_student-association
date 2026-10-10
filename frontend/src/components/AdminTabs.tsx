import { useRef, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

export type AdminTab<K extends string> = { key: K; label: string; icon: LucideIcon };

/** The active tab key from `?tab=`, falling back to the first tab for a missing or unknown value. */
export function useAdminTab<K extends string>(tabs: readonly AdminTab<K>[]): K {
  const [params] = useSearchParams();
  const t = params.get('tab');
  return (tabs.find((x) => x.key === t)?.key ?? tabs[0].key) as K;
}

/**
 * Tab bar synced to `?tab=`, so each tab has its own URL (shareable, and Back works). Switching tabs drops the
 * other query params, which belong to the tab you were on (e.g. `event=` on Events). Arrow keys move between tabs.
 */
export function AdminTabs<K extends string>({ tabs, panelId }: { tabs: readonly AdminTab<K>[]; panelId: string }) {
  const [, setParams] = useSearchParams();
  const active = useAdminTab(tabs);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (k: K) => setParams(k === tabs[0].key ? {} : { tab: k });
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + tabs.length) % tabs.length;
    select(tabs[n].key); refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label="Admin sections" className="card-sunken scrollbar-thin mb-6 flex gap-1 overflow-x-auto p-1">
      {tabs.map((t, i) => {
        const on = t.key === active;
        return (
          <button key={t.key} ref={(el) => { refs.current[i] = el; }} role="tab" type="button" id={`tab-${t.key}`} aria-selected={on} aria-controls={panelId} tabIndex={on ? 0 : -1}
            onClick={() => select(t.key)} onKeyDown={(e) => onKey(e, i)}
            className={`interactive inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm font-medium ${on ? 'bg-surface-elevated text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
            <t.icon className={`size-4 ${on ? 'text-accent' : 'text-text-tertiary'}`} aria-hidden />{t.label}
          </button>
        );
      })}
    </div>
  );
}
