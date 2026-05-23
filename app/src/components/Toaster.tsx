import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type ToastTone = "error" | "success" | "info";

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface InternalToast extends Toast {
  expiresAt: number;
}

export function useToasts(autoDismissMs = 6000) {
  const [toasts, setToasts] = useState<InternalToast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const expiresAt = Date.now() + autoDismissMs;
      setToasts((prev) => [...prev, { ...toast, id, expiresAt }]);
      const timer = setTimeout(() => dismiss(id), autoDismissMs);
      timersRef.current.set(id, timer);
      return id;
    },
    [autoDismissMs, dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  return { toasts, push, dismiss };
}

interface ToasterProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const TONE_COLOR: Record<ToastTone, string> = {
  error: "var(--color-error)",
  success: "var(--color-primary)",
  info: "var(--color-on-surface-variant)",
};

function ToneIcon({ tone, color }: { tone: ToastTone; color: string }) {
  const Icon = tone === "error" ? AlertTriangle : tone === "success" ? CheckCircle2 : Info;
  return <Icon className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color }} />;
}

export function Toaster({ toasts, onDismiss }: ToasterProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[360px] flex-col gap-2">
      {toasts.map((t) => {
        const color = TONE_COLOR[t.tone];
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-container)] px-4 py-3 shadow-2xl shadow-black/60"
            style={{ borderLeftColor: color, borderLeftWidth: 3 }}
          >
            <ToneIcon tone={t.tone} color={color} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--color-on-surface)]">
                {t.title}
              </p>
              {t.body ? (
                <p className="mt-1 break-words text-xs text-[var(--color-on-surface-variant)]">
                  {t.body}
                </p>
              ) : null}
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className="shrink-0 rounded-md p-1 text-[var(--color-outline)] hover:bg-[var(--color-surface-low)] hover:text-[var(--color-on-surface)]"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
