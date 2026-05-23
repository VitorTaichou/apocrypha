import { Loader2 } from "lucide-react";

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  pending?: boolean;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  pending,
}: ToggleProps) {
  const isOff = !checked;
  return (
    <label
      className={`flex items-start justify-between gap-4 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm text-[var(--color-on-surface)]">{label}</div>
        {description ? (
          <div className="mt-0.5 text-xs text-[var(--color-on-surface-variant)]">
            {description}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled || pending}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:cursor-not-allowed ${
          checked
            ? "border-[var(--color-primary)] bg-[var(--color-primary-container)]/40"
            : "border-[var(--color-border)] bg-[var(--color-surface-low)]"
        }`}
      >
        <span
          className={`flex h-4 w-4 items-center justify-center rounded-full transition-transform ${
            checked
              ? "translate-x-6 bg-[var(--color-primary)]"
              : "translate-x-1 bg-[var(--color-outline)]"
          }`}
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin text-[var(--color-on-primary)]" />
          ) : null}
        </span>
        <span className="sr-only">{isOff ? "Off" : "On"}</span>
      </button>
    </label>
  );
}
