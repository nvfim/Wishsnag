import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'savings';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'text-white shadow-[0_6px_16px_-6px_rgb(95_59_230/0.6)] bg-[linear-gradient(135deg,#6a45f0,#5733d1)] hover:brightness-110 active:brightness-95',
  secondary: 'bg-surface text-fg border border-line hover:bg-surface-2 hover:border-lilac-300/60',
  ghost: 'text-fg hover:bg-surface-2',
  soft: 'bg-accent-soft text-accent hover:brightness-[0.97] dark:hover:brightness-110',
  danger: 'bg-danger-soft text-danger hover:brightness-[0.97] dark:hover:brightness-110',
  savings: 'bg-savings-soft text-savings hover:brightness-[0.97] dark:hover:brightness-110',
};
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-xl',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-2xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', loading, icon, block, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold whitespace-nowrap transition-[filter,background-color,border-color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
  variant?: 'ghost' | 'secondary' | 'soft';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, size = 'md', variant = 'ghost', className, children, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-xl text-muted transition-colors hover:text-fg disabled:opacity-40',
        size === 'sm' ? 'size-8' : 'size-10',
        variant === 'ghost' && 'hover:bg-surface-2',
        variant === 'secondary' && 'border border-line bg-surface hover:bg-surface-2',
        variant === 'soft' && 'bg-accent-soft text-accent hover:text-accent',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export function Card({ className, interactive, ...rest }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-soft)]',
        interactive && 'transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-lilac-300/50 hover:shadow-[var(--shadow-lift)]',
        className,
      )}
      {...rest}
    />
  );
}

export type BadgeTone = 'neutral' | 'lilac' | 'hot' | 'savings' | 'warn' | 'danger' | 'outline';
const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-muted',
  lilac: 'bg-accent-soft text-accent',
  hot: 'bg-hot-soft text-hot',
  savings: 'bg-savings-soft text-savings',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  outline: 'border border-line text-muted',
};

export function Badge({ tone = 'neutral', icon, className, children, title }: { tone?: BadgeTone; icon?: ReactNode; className?: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold leading-5 whitespace-nowrap', TONES[tone], className)}>
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-muted', className)}>
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      {label && <span>{label}</span>}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('rounded-xl bg-[linear-gradient(90deg,var(--ws-surface-2)_0%,var(--ws-border)_50%,var(--ws-surface-2)_100%)] bg-[length:200%_100%] animate-shimmer', className)} />;
}

export function EmptyState({ icon, title, body, action, className, compact }: { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center text-center animate-fade-up', compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-14', className)}>
      <div className={cn('grid place-items-center rounded-3xl bg-accent-soft text-accent', compact ? 'size-12' : 'size-16')}>{icon}</div>
      <div>
        <h3 className={cn('font-display font-bold text-fg', compact ? 'text-[15px]' : 'text-lg')}>{title}</h3>
        {body && <div className={cn('mx-auto mt-1 max-w-md text-muted', compact ? 'text-[13px]' : 'text-sm')}>{body}</div>}
      </div>
      {action}
    </div>
  );
}

export function SectionHeader({ title, subtitle, action, id }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="font-display text-lg font-bold text-fg">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-line', className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>;
}
