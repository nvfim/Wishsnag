import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from './primitives';

const control =
  'w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg placeholder:text-muted/70 transition-[border-color,box-shadow] hover:border-lilac-300/60 focus:border-lilac-400 focus:outline-none focus:ring-4 focus:ring-lilac-500/15 disabled:opacity-60 aria-[invalid=true]:border-danger';

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  warning?: string | null;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode;
  className?: string;
  optional?: string;
}

export function Field({ label, hint, error, warning, children, className, optional }: FieldProps) {
  const id = useId();
  const describedBy = error || warning || hint ? `${id}-desc` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="flex items-center justify-between text-[13px] font-semibold text-fg">
        <span>{label}</span>
        {optional && <span className="text-[11px] font-medium text-muted">{optional}</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {(error || warning || hint) && (
        <p id={describedBy} className={cn('flex items-start gap-1 text-[12px]', error ? 'text-danger' : warning ? 'text-warn' : 'text-muted')}>
          {(error || warning) && <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />}
          <span>{error || warning || hint}</span>
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(control, 'h-10', className)} {...rest} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-20 py-2 leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        control,
        'h-10 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22none%22%20stroke%3D%22%238a8597%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});

export function Toggle({ checked, onChange, label, description, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; id?: string }) {
  const autoId = useId();
  const tid = id ?? autoId;
  return (
    <div className={cn('flex items-start justify-between gap-4', disabled && 'opacity-60')}>
      <label htmlFor={tid} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-semibold text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-[12.5px] text-muted">{description}</span>}
      </label>
      <button
        id={tid}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-lilac-600' : 'bg-ink-200 dark:bg-ink-600')}
      >
        <span className={cn('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200', checked && 'translate-x-5')} />
      </button>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, className, indeterminate }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; className?: string; indeterminate?: boolean }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-fg', className)}>
      <input
        type="checkbox"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = !!indeterminate;
        }}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-line accent-[#6a45f0]"
      />
      {label}
    </label>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

export function Segmented<T extends string>({ value, onChange, options, label, size = 'md', className }: { value: T; onChange: (v: T) => void; options: SegmentOption<T>[]; label: string; size?: 'sm' | 'md'; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-xl border border-line bg-surface-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-[10px] font-semibold whitespace-nowrap transition-all',
            size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Parses a number typed by the user (accepts Bengali digits and thousands separators). */
export function parseNumberInput(value: string): number | null {
  const ascii = value.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6)).replace(/[,\s]/g, '');
  if (!ascii) return null;
  const n = Number(ascii);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}
