import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode };

/** The landing button classes: cream solid primary, cream outline secondary (see index.css). Danger is a crimson fill. */
const variants: Record<Variant, string> = { primary: 'btn-l-primary', secondary: 'btn-l-secondary', ghost: 'btn-ghost', danger: 'btn-danger' };
/** Both sizes keep a 44px hit area; `sm` is visually compact. */
const sizes: Record<Size, string> = { sm: 'btn-l-sm !min-h-11 !px-3.5 !text-[0.68rem]', md: 'btn-l-sm !min-h-11 !px-5' };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', loading, icon, className = '', children, disabled, ...rest }, ref) {
  return (
    <button ref={ref} className={`${variants[variant]} ${sizes[size]} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

/** Icon-only control: always needs `label` for assistive tech. */
export function IconButton({ label, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={`inline-flex size-11 items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-surface-elevated interactive disabled:opacity-50 ${className}`} {...rest}>
      {children}
    </button>
  );
}
