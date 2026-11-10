import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { Button, IconButton, cn } from './primitives';

// ---------------------------------------------------------------- Dialog (native <dialog>)

export function Dialog({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    }
    if (!open && el.open) {
      if (typeof el.close === 'function') el.close();
      else el.removeAttribute('open');
    }
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-3xl border border-line bg-surface p-0 text-fg shadow-[var(--shadow-lift)] backdrop:bg-ink-950/50 backdrop:backdrop-blur-sm animate-pop-in',
        size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-3xl' : 'max-w-lg',
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="font-display text-base font-bold">{title}</h2>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
    </dialog>
  );
}

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
}

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={!!state}
        onClose={() => close(false)}
        title={state?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button onClick={() => close(false)}>{state?.cancelLabel}</Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {state?.confirmLabel}
            </Button>
          </>
        }
      >
        <div className="text-sm text-muted">{state?.body}</div>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}

// ---------------------------------------------------------------- Toasts

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: ReactNode;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: ReactNode, opts?: { tone?: ToastTone; action?: ToastItem['action']; duration?: number }) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const show = useCallback<ToastApi['show']>((message, opts = {}) => {
    const id = ++counter.current;
    setToasts((t) => [...t.slice(-2), { id, tone: opts.tone ?? 'success', message, action: opts.action }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.duration ?? 3800);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-fg shadow-[var(--shadow-lift)] animate-pop-in">
            {t.tone === 'success' ? <CircleCheck className="size-5 shrink-0 text-savings" /> : t.tone === 'error' ? <CircleAlert className="size-5 shrink-0 text-danger" /> : <Info className="size-5 shrink-0 text-accent" />}
            <span className="min-w-0">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="ml-1 shrink-0 font-semibold text-accent hover:underline"
                onClick={() => {
                  t.action?.onClick();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
