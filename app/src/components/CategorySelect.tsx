import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Layers } from "lucide-react";
import { getCategoryMeta } from "@/lib/categoryMeta";
import type { Category } from "@/lib/types";

interface CategorySelectProps {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
}

export function CategorySelect({
  categories,
  value,
  onChange,
}: CategorySelectProps) {
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

  const selected = categories.find((c) => c.id === value);
  const selectedMeta = value ? getCategoryMeta(value) : null;
  const SelectedIcon = selectedMeta?.icon ?? Layers;

  return (
    <div ref={wrapperRef} className="relative w-72 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-lowest)] py-3.5 pl-4 pr-3 text-base text-[var(--color-on-surface)] hover:border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <SelectedIcon
            className="h-4 w-4 shrink-0"
            strokeWidth={1.75}
            style={{ color: selectedMeta?.color ?? "var(--color-on-surface-variant)" }}
          />
          <span className="truncate">
            {selected ? selected.title : "All categories"}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--color-outline)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={1.75}
        />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-[420px] overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface-lowest)] p-1 shadow-2xl shadow-black/60">
          <Option
            label="All categories"
            count={categories.reduce((sum, c) => sum + c.file_count, 0)}
            active={!value}
            icon={Layers}
            color="var(--color-on-surface-variant)"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          />
          <div className="my-1 h-px bg-[var(--color-border)]" />
          {categories.map((c) => {
            const m = getCategoryMeta(c.id);
            return (
              <Option
                key={c.id}
                label={c.title}
                count={c.file_count}
                active={value === c.id}
                icon={m.icon}
                color={m.color}
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Option({
  label,
  count,
  active,
  icon: Icon,
  color,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  icon: typeof Layers;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm transition-colors ${
        active
          ? "bg-[var(--color-surface-container)] text-[var(--color-on-surface)]"
          : "text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-low)] hover:text-[var(--color-on-surface)]"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color }} />
      <span className="flex-1 truncate">{label}</span>
      <span className="shrink-0 font-mono text-[11px] text-[var(--color-outline)]">
        {count}
      </span>
      {active ? (
        <Check
          className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]"
          strokeWidth={2}
        />
      ) : null}
    </button>
  );
}
