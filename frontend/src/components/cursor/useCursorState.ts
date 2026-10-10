import { useSyncExternalStore } from 'react';

export type CursorMode = 'default' | 'link' | 'button' | 'view' | 'merch' | 'join' | 'text';
export type CursorTheme = 'dark' | 'light';
export type CursorState = {
  mode: CursorMode;
  /** Text shown in the ring for `view` / `join` (or any element with data-cursor-label). */
  label: string | null;
  theme: CursorTheme;
  visible: boolean;
  pressed: boolean;
  /** Increments whenever the hovered target element changes, to replay one-shot gestures. */
  nonce: number;
};

let state: CursorState = { mode: 'default', label: null, theme: 'dark', visible: false, pressed: false, nonce: 0 };
const listeners = new Set<() => void>();

export function setCursorState(patch: Partial<CursorState>) {
  if (!(Object.keys(patch) as (keyof CursorState)[]).some((k) => state[k] !== patch[k])) return;
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export const getCursorState = () => state;

/** Subscribe to the cursor store. Updates only on hover-target, visibility or press changes, never per mousemove. */
export function useCursorState() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
    () => state,
  );
}

const DEFAULT_LABEL: Partial<Record<CursorMode, string>> = { view: 'View', join: 'Join us' };

/**
 * Work out the cursor mode for the element under the pointer. Walks up from the target;
 * the nearest of `data-cursor`, a text field, a button or a link wins.
 */
export function resolveCursor(el: Element | null) {
  let mode: CursorMode = 'default';
  let label: string | null = null;
  let magnet: HTMLElement | null = null;
  let target: Element | null = null;
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.matches('input, textarea, select, [contenteditable="true"]')) { mode = 'text'; target = n; break; }
    const tag = n.getAttribute('data-cursor') as CursorMode | null;
    if (tag) { mode = tag; label = n.getAttribute('data-cursor-label'); target = n; break; }
    if (n.matches('button, [role="button"]')) { mode = 'button'; target = n; break; }
    if (n.matches('a[href]')) { mode = 'link'; target = n; break; }
  }
  if (mode === 'button' && target instanceof HTMLElement) magnet = target;
  const theme: CursorTheme = el?.closest('[data-theme]')?.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  return { mode, label: label ?? DEFAULT_LABEL[mode] ?? null, theme, magnet, target };
}
