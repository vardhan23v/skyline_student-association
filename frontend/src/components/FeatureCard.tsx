import type { ReactNode } from 'react';

type Props = { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; aside?: ReactNode; footer?: ReactNode; glow?: 'horizon' | 'corner' | 'none'; className?: string; children?: ReactNode };

/**
 * The one card per view allowed to carry light. `horizon` is the reference's blue
 * glow rising from the bottom edge; `corner` is a quieter top-right pool.
 */
export function FeatureCard({ eyebrow, title, description, aside, footer, glow = 'horizon', className = '', children }: Props) {
  const glowClass = glow === 'horizon' ? 'glow-horizon' : glow === 'corner' ? 'glow-corner' : '';
  return (
    <section className={`card ${glowClass} flex flex-col gap-4 p-6 md:p-7 min-w-0 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {eyebrow && <div className="t-label mb-2">{eyebrow}</div>}
          <h2 className="t-title text-balance">{title}</h2>
          {description && <p className="mt-2 text-sm text-text-secondary max-w-prose">{description}</p>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      {children}
      {footer && <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">{footer}</div>}
    </section>
  );
}
