import { AlertTriangle, Check, CircleDashed, Clock, Lock, X, type LucideIcon } from 'lucide-react';

type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';
const toneClass: Record<Tone, string> = {
  success: 'bg-success-soft text-success', info: 'bg-cream/10 text-cream', warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger', neutral: 'bg-surface-elevated text-text-secondary',
};
/** Status is never colour-only: each tone carries an icon and the text itself. */
const map: Record<string, { tone: Tone; icon: LucideIcon }> = {
  active: { tone: 'success', icon: Check }, confirmed: { tone: 'success', icon: Check }, paid: { tone: 'success', icon: Check }, published: { tone: 'success', icon: Check }, done: { tone: 'success', icon: Check }, fulfilled: { tone: 'success', icon: Check }, completed: { tone: 'success', icon: Check }, on_track: { tone: 'success', icon: Check },
  approved: { tone: 'info', icon: Check }, checked_in: { tone: 'info', icon: Check }, doing: { tone: 'info', icon: CircleDashed },
  pending: { tone: 'warning', icon: Clock }, submitted: { tone: 'warning', icon: Clock }, planning: { tone: 'neutral', icon: CircleDashed }, planned: { tone: 'neutral', icon: CircleDashed }, todo: { tone: 'neutral', icon: CircleDashed }, draft: { tone: 'neutral', icon: Lock },
  expired: { tone: 'danger', icon: AlertTriangle }, rejected: { tone: 'danger', icon: X }, cancelled: { tone: 'danger', icon: X }, failed: { tone: 'danger', icon: X }, behind: { tone: 'danger', icon: AlertTriangle }, no_data: { tone: 'neutral', icon: CircleDashed }, closed: { tone: 'neutral', icon: Lock },
};

export function StatusBadge({ status, tone, children, className = '' }: { status?: string | null; tone?: Tone; children?: React.ReactNode; className?: string }) {
  const key = status ?? 'none';
  const m = map[key] ?? { tone: tone ?? 'neutral', icon: CircleDashed };
  const Icon = m.icon;
  return (
    <span className={`badge ${toneClass[tone ?? m.tone]} ${className}`}>
      <Icon className="size-3" aria-hidden />
      {children ?? key.replace(/_/g, ' ')}
    </span>
  );
}
