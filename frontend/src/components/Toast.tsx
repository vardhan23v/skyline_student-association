import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

type Tone = 'success' | 'error' | 'info' | 'warning';
type Toast = { id: number; tone: Tone; title: string; body?: string };
type Ctx = { toast: (t: Omit<Toast, 'id'>) => void; success: (title: string, body?: string) => void; error: (title: string, body?: string) => void };
const ToastCtx = createContext<Ctx>(null!);

const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
const tones: Record<Tone, string> = { success: 'text-success', error: 'text-danger', info: 'text-accent-text', warning: 'text-warning' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setItems((l) => [...l, { ...t, id }].slice(-4));
    window.setTimeout(() => dismiss(id), t.tone === 'error' ? 7000 : 4000);
  }, [dismiss]);
  const value = useMemo<Ctx>(() => ({ toast, success: (title, body) => toast({ tone: 'success', title, body }), error: (title, body) => toast({ tone: 'error', title, body }) }), [toast]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 bottom-20 z-[var(--z-toast)] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6">
        {items.map((t) => { const Icon = icons[t.tone]; return (
          <div key={t.id} role="status" className="glass pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-lg)] px-4 py-3 slide-up">
            <Icon className={`size-4 shrink-0 mt-0.5 ${tones[t.tone]}`} aria-hidden />
            <div className="min-w-0 flex-1 text-sm"><div className="font-medium">{t.title}</div>{t.body && <div className="t-caption mt-0.5">{t.body}</div>}</div>
            <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="-mr-1 inline-flex size-8 items-center justify-center rounded-full text-text-tertiary hover:text-text-primary"><X className="size-3.5" aria-hidden /></button>
          </div>
        ); })}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
