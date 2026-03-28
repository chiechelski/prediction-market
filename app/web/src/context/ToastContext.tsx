import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type ToastVariant = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  variant: ToastVariant;
  message: string;
};

const ToastContext = createContext<{
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
} | null>(null);

const DEFAULT_DURATION_MS = 4500;
const MAX_VISIBLE = 5;

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  const { variant, message } = toast;
  const icon =
    variant === 'success' ? 'check_circle' : variant === 'error' ? 'error' : 'info';
  const fill = variant === 'success' || variant === 'error';
  const borderRing =
    variant === 'success'
      ? 'border-secondary/35 ring-1 ring-secondary/15'
      : variant === 'error'
        ? 'border-error/40 ring-1 ring-error/10'
        : 'border-primary/30 ring-1 ring-primary/10';
  const iconClass =
    variant === 'success'
      ? 'text-secondary'
      : variant === 'error'
        ? 'text-error'
        : 'text-primary';

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`toast-slide-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface-container-high px-4 py-3 shadow-lg shadow-black/30 backdrop-blur-sm ${borderRing}`}
    >
      <span
        className={`material-symbols-outlined mt-0.5 shrink-0 text-[22px] ${iconClass}`}
        style={fill ? { fontVariationSettings: "'FILL' 1, 'wght' 500" } : undefined}
        aria-hidden
      >
        {icon}
      </span>
      <p className="min-w-0 flex-1 pt-0.5 text-sm font-medium leading-snug text-on-surface">
        {message}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-lg p-1 text-outline transition-colors hover:bg-surface-container-highest hover:text-on-surface"
        aria-label="Dismiss notification"
      >
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: string) => {
    const t = timeoutsRef.current.get(id);
    if (t) clearTimeout(t);
    timeoutsRef.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const trimmed = message.trim();
      if (!trimmed) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      setToasts((prev) => [...prev, { id, variant, message: trimmed }].slice(-MAX_VISIBLE));
      const tid = setTimeout(() => remove(id), DEFAULT_DURATION_MS);
      timeoutsRef.current.set(id, tid);
    },
    [remove]
  );

  useEffect(
    () => () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current.clear();
    },
    []
  );

  const value = useMemo(
    () => ({
      success: (m: string) => push('success', m),
      error: (m: string) => push('error', m),
      info: (m: string) => push('info', m),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col-reverse gap-2 p-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-w-md sm:flex-col"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
