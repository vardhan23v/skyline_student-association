import { useEffect, useRef, type KeyboardEvent } from 'react';
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
 * Admin navigation in the landing glass: a sticky vertical sidebar from lg up; below lg a tab strip pinned under the
 * navbar that scrolls sideways (snap, faded edges) and keeps the active tab centred. Never both at once. Synced to `?tab=`, so each tab has its own URL (shareable, and Back works). Switching tabs drops the
 * other query params, which belong to the tab you were on (e.g. `event=` on Events). Arrow keys move between tabs.
 */
export function AdminTabs<K extends string>({ tabs, panelId }: { tabs: readonly AdminTab<K>[]; panelId: string }) {
  const [, setParams] = useSearchParams();
  const active = useAdminTab(tabs);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const strip = useRef<HTMLDivElement>(null);
  const select = (k: K) => setParams(k === tabs[0].key ? {} : { tab: k });
  // Below lg the strip scrolls sideways: centre the active tab (e.g. after opening /admin?tab=orders). Scrolls the strip
  // only; scrollIntoView would also move the page.
  const first = useRef(true);
  useEffect(() => {
    const el = refs.current[tabs.findIndex((t) => t.key === active)], row = strip.current;
    if (!el || !row || row.scrollWidth <= row.clientWidth) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.scrollTo({ left: el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2, behavior: first.current || reduce ? 'auto' : 'smooth' });
    first.current = false;
  }, [active, tabs]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + tabs.length) % tabs.length;
    select(tabs[n].key); refs.current[n]?.focus();
  };
  return (
    <div className="glass sticky top-[calc(env(safe-area-inset-top)+5.25rem)] z-30 mb-6 rounded-2xl p-1 lg:top-28 lg:mb-0 lg:p-2">
    <div ref={strip} role="tablist" aria-label="Admin sections" className="scroll-row fade-x gap-1 lg:flex-col lg:overflow-visible lg:[mask-image:none] lg:[-webkit-mask-image:none]">
      {tabs.map((t, i) => {
        const on = t.key === active;
        return (
          <button key={t.key} ref={(el) => { refs.current[i] = el; }} role="tab" type="button" id={`tab-${t.key}`} aria-selected={on} aria-controls={panelId} tabIndex={on ? 0 : -1}
            onClick={() => select(t.key)} onKeyDown={(e) => onKey(e, i)}
            className={`t-nav interactive relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 !text-[0.7rem] lg:gap-2.5 ${on ? 'bg-cream/10 text-cream' : 'text-cream/70 hover:bg-cream/5 hover:text-cream'}`}>
            <span className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent transition-opacity lg:inset-x-auto lg:inset-y-2.5 lg:left-0 lg:h-auto lg:w-0.5 ${on ? 'opacity-100' : 'opacity-0'}`} aria-hidden />
            <t.icon className={`size-4 ${on ? 'text-accent-text' : 'text-cream/60'}`} aria-hidden />{t.label}
          </button>
        );
      })}
    </div>
    </div>
  );
}
