import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type FieldProps = { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string; className?: string };
export function Field({ label, hint, error, children, htmlFor, className = '' }: FieldProps) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p role="alert" className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 t-caption">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', ...rest }, ref) {
  return <input ref={ref} className={`input ${className}`} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = '', ...rest }, ref) {
  return <textarea ref={ref} className={`input min-h-24 ${className}`} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className = '', children, ...rest }, ref) {
  return <select ref={ref} className={`input ${className}`} {...rest}>{children}</select>;
});

/** Label + control in one, with a generated id so the pair is always associated. */
export function LabeledInput({ label, hint, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string }) {
  const id = useId();
  return <Field label={label} hint={hint} error={error} htmlFor={id}><Input id={id} aria-invalid={!!error || undefined} {...rest} /></Field>;
}
export function LabeledSelect({ label, hint, error, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode; error?: string }) {
  const id = useId();
  return <Field label={label} hint={hint} error={error} htmlFor={id}><Select id={id} {...rest}>{children}</Select></Field>;
}
export function LabeledTextarea({ label, hint, error, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode; error?: string }) {
  const id = useId();
  return <Field label={label} hint={hint} error={error} htmlFor={id}><Textarea id={id} {...rest} /></Field>;
}
