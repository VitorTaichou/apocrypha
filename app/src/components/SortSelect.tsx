import { useEffect, useRef, useState } from "react";
import {
  ArrowDownAZ,
  Check,
  ChevronDown,
  Clock,
  Flame,
  Heart,
  TrendingUp,
} from "lucide-react";
import type { SortKey } from "@/lib/types";

interface SortOption {
  key: SortKey;
  label: string;
  icon: typeof Clock;
}

const OPTIONS: SortOption[] = [
  { key: "download_total", label: "Most Downloaded", icon: TrendingUp },
  { key: "download_monthly", label: "Trending This Month", icon: Flame },
  { key: "last_updated", label: "Recently Updated", icon: Clock },
  { key: "favorite_total", label: "Most Favorited", icon: Heart },
  { key: "name", label: "Name (A–Z)", icon: ArrowDownAZ },
];

interface SortSelectProps {
  value: SortKey;
  onChange: (key: SortKey) => void;
}

export function SortSelect({ value, onChange }: SortSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = OPTIONS.find((o) => o.key === value) ?? OPTIONS[0];
  const CurrentIcon = current.icon;

  return (
    <div ref={wrapperRef} className="relative w-56 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-lowest)] py-3.5 pl-4 pr-3 text-base text-[var(--color-on-surface)] hover:border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <CurrentIcon
            className="h-4 w-4 shrink-0 text-[var(--color-on-surface-variant)]"
            strokeWidth={1.75}
          />
          <span className="truncate text-sm">{current.label}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--color-outline)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={1.75}
        />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-lowest)] p-1 shadow-2xl shadow-black/60">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = opt.key === value;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  onChange(opt.key);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? "bg-[var(--color-surface-container)] text-[var(--color-on-surface)]"
                    : "text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-low)] hover:text-[var(--color-on-surface)]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span className="flex-1">{opt.label}</span>
                {active ? (
                  <Check
                    className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]"
                    strokeWidth={2}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

