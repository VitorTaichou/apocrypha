import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, Clock, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface Option {
  value: number;
  label: string;
}

const OPTIONS: Option[] = [
  { value: 0, label: "Off" },
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
  { value: 120, label: "Every 2 hours" },
  { value: 240, label: "Every 4 hours" },
];

export function AutoUpdatePanel() {
  const [interval, setInterval] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getAutoUpdateInterval()
      .then((n) => {
        if (alive) setInterval(n);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleChange = useCallback(async (next: number) => {
    setPending(true);
    setError(null);
    try {
      await api.setAutoUpdateInterval(next);
      setInterval(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(false);
    }
  }, []);

  const description =
    interval === null
      ? "Loading..."
      : interval === 0
      ? "Auto-update is off. Apocrypha won't touch addons in the background."
      : "Apocrypha checks for updates on this cadence and applies them while ESO is closed.";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-[var(--color-on-surface)]">{description}</p>
        <div className="relative w-56 shrink-0">
          <select
            value={interval ?? 0}
            disabled={interval === null || pending}
            onChange={(e) => handleChange(Number(e.target.value))}
            className="w-full appearance-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface-lowest)] py-2 pl-3.5 pr-9 text-sm text-[var(--color-on-surface)] hover:border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-60"
          >
            {OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {pending ? (
            <Loader2
              className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--color-primary)]"
              strokeWidth={2}
            />
          ) : (
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-outline)]"
              strokeWidth={1.75}
            />
          )}
        </div>
      </div>

      {interval !== null && interval > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-2 text-xs text-[var(--color-on-surface-variant)]">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-outline)]" strokeWidth={1.75} />
          <span>
            Updates pause automatically while <span className="font-mono">eso64.exe</span> is running, so the game's file handles stay safe. Apocrypha must be at least minimised to the tray for this to work — quitting the app stops the loop.
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error-container)]/15 px-3 py-2 text-xs text-[var(--color-error)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {error}
        </div>
      ) : null}
    </div>
  );
}
