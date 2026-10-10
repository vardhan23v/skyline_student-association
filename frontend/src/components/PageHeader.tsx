import type { ReactNode } from 'react';
import { SectionHeading } from './landing/SectionHeading';

/** `script` is the page's one lowercase accent word, e.g. script="your" title="Account" → *your* ACCOUNT. */
type Props = { script: string; title: string; eyebrow?: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string };

/** Page title block: the landing SectionHeading (script accent + uppercase title) as the page's h1. */
export function PageHeader({ script, title, eyebrow, description, actions, className = '' }: Props) {
  return (
    <header className={`mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 md:mb-8 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <div className="t-label mb-3">{eyebrow}</div>}
        <SectionHeading as="h1" size="md" script={script} title={title} />
        {description && <p className="mt-3 max-w-2xl text-base text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-end gap-2">{actions}</div>}
    </header>
  );
}

export function SectionHeader({ title, meta, actions, as: Tag = 'h2', className = '' }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; as?: 'h2' | 'h3'; className?: string }) {
  return (
    <div className={`mb-3 flex flex-wrap items-center justify-between gap-2 ${className}`}>
      <div className="flex items-baseline gap-3 min-w-0">
        <Tag className="t-section truncate">{title}</Tag>
        {meta && <span className="t-label">{meta}</span>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
