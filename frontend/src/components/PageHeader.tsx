import type { ReactNode } from 'react';

type Props = { title: ReactNode; eyebrow?: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string };

/** Page title block. Eyebrow is the mono meta line (section · date · context). */
export function PageHeader({ title, eyebrow, description, actions, className = '' }: Props) {
  return (
    <header className={`mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <div className="t-label mb-2">{eyebrow}</div>}
        <h1 className="t-title">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-text-secondary max-w-2xl">{description}</p>}
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
