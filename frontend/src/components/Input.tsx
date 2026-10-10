import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type FieldProps = { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string; className?: string };
/** Ids for a field's hint and error text, so the control can point at them with aria-describedby. */
const describedBy = (id: string, error?: string, hint?: ReactNode) => (error ? `${id}-err` : hint ? `${id}-hint` : undefined);

export function Field({ label, hint, error, children, htmlFor, className = '' }: FieldProps) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {/* role="alert" announces the error the moment it appears (on submit), not only when the field is focused. */}
      {error ? <p id={htmlFor && `${htmlFor}-err`} role="alert" className="mt-1.5 text-sm text-danger">{error}</p> : hint ? <p id={htmlFor && `${htmlFor}-hint`} className="mt-1 t-caption">{hint}</p> : null}
    </div>
  );
}

/**
 * Text input. `type="password"` gets a 44px show/hide button inside the field; the input keeps its id, ref and
 * autocomplete so password managers still recognise it.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', type, ...rest }, ref) {
  const [shown, setShown] = useState(false);
  if (type !== 'password') return <input ref={ref} type={type} className={`input ${className}`} {...rest} />;
  return (
    <div className="relative">
      <input ref={ref} type={shown ? 'text' : 'password'} className={`input pr-12 ${className}`} {...rest} />
      <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} aria-controls={rest.id}
        className="absolute right-0.5 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-text-secondary hover:text-text-primary focus-ring">
        {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = '', ...rest }, ref) {
  return <textarea ref={ref} className={`input min-h-24 ${className}`} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className = '', children, ...rest }, ref) {
  return <select ref={ref} className={`input ${className}`} {...rest}>{children}</select>;
});

/** Label + control in one, with a generated id so the pair is always associated. */
export const LabeledInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string }>(function LabeledInput({ label, hint, error, id: given, ...rest }, ref) {
  const auto = useId(); const id = given ?? auto;
  return <Field label={label} hint={hint} error={error} htmlFor={id}><Input ref={ref} id={id} aria-invalid={!!error || undefined} aria-describedby={describedBy(id, error, hint)} {...rest} /></Field>;
});
export function LabeledSelect({ label, hint, error, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode; error?: string }) {
  const id = useId();
  return <Field label={label} hint={hint} error={error} htmlFor={id}><Select id={id} aria-invalid={!!error || undefined} aria-describedby={describedBy(id, error, hint)} {...rest}>{children}</Select></Field>;
}
export function LabeledTextarea({ label, hint, error, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode; error?: string }) {
  const id = useId();
  return <Field label={label} hint={hint} error={error} htmlFor={id}><Textarea id={id} aria-invalid={!!error || undefined} aria-describedby={describedBy(id, error, hint)} {...rest} /></Field>;
}
