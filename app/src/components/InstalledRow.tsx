import { useState } from "react";
import { ArrowUpCircle, Check, Loader2, Trash2 } from "lucide-react";
import type { InstalledAddon } from "@/lib/types";
import { CategoryIcon } from "@/components/CategoryIcon";
import { formatRelativeTime } from "@/lib/format";

interface InstalledRowProps {
  addon: InstalledAddon;
  uninstalling?: boolean;
  updating?: boolean;
  selected?: boolean;
  onUninstall?: () => void;
  onUpdate?: () => void;
  onSelect?: () => void;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function InstalledThumb({ addon }: { addon: InstalledAddon }) {
  const [errored, setErrored] = useState(false);
  const src = addon.thumbnail_url ?? null;

  if (!src || errored) {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-low)] text-[11px] font-medium uppercase tracking-wider text-[var(--color-primary)]/80">
        {initials(addon.title)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setErrored(true)}
      className="h-11 w-11 shrink-0 rounded-md border border-[var(--color-border)] object-cover"
    />
  );
}

function TimestampsLine({ addon }: { addon: InstalledAddon }) {
  const released = addon.catalog_last_updated
    ? formatRelativeTime(addon.catalog_last_updated)
    : null;
  const installed = addon.installed_at
    ? formatRelativeTime(addon.installed_at)
    : null;

  if (!released && !installed) return null;

  return (
    <p className="mt-0.5 truncate text-[11px] text-[var(--color-outline)]">
      {released ? <span>Released {released}</span> : null}
      {released && installed ? (
        <span className="mx-1.5 text-[var(--color-outline-variant)]">·</span>
      ) : null}
      {installed ? <span>Installed {installed}</span> : null}
    </p>
  );
}

function StatusText({ addon }: { addon: InstalledAddon }) {
  if (addon.update_available) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-primary)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
        v{addon.catalog_version} available
      </span>
    );
  }
  if (addon.catalog_id) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-outline)]">
        <Check className="h-3 w-3" strokeWidth={2} />
        Up to date
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-outline)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-surface-high)]" />
      Orphan
    </span>
  );
}

const ACTION_BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium w-[108px]";

function UpdateButton({
  updating,
  onUpdate,
}: {
  updating: boolean;
  onUpdate?: () => void;
}) {
  if (updating) {
    return (
      <span
        className={`${ACTION_BASE} border-[var(--color-primary-container)]/40 bg-[var(--color-primary-container)]/20 text-[var(--color-primary)]`}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        Updating
      </span>
    );
  }
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onUpdate?.();
      }}
      className={`${ACTION_BASE} border-[var(--color-primary)]/40 bg-[var(--color-primary-container)]/15 text-[var(--color-primary)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-container)]/30`}
    >
      <ArrowUpCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
      Update
    </button>
  );
}

function UninstallButton({
  uninstalling,
  onUninstall,
}: {
  uninstalling: boolean;
  onUninstall?: () => void;
}) {
  if (uninstalling) {
    return (
      <span
        className={`${ACTION_BASE} border-[var(--color-border)] bg-[var(--color-surface-low)] text-[var(--color-error)]`}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        Removing
      </span>
    );
  }
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onUninstall?.();
      }}
      className={`${ACTION_BASE} border-[var(--color-border)] bg-[var(--color-surface-low)] text-[var(--color-on-surface-variant)] transition-colors group-hover:border-[var(--color-on-surface-variant)]/40 group-hover:bg-[var(--color-surface-lowest)] hover:!border-[var(--color-error)] hover:text-[var(--color-error)]`}
    >
      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
      Uninstall
    </button>
  );
}

export function InstalledRow({
  addon,
  uninstalling = false,
  updating = false,
  selected = false,
  onUninstall,
  onUpdate,
  onSelect,
}: InstalledRowProps) {
  return (
    <article
      onClick={onSelect}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={(e) => {
        if (onSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group flex items-center gap-4 border-b border-[var(--color-border)] px-5 py-3 transition-colors last:border-b-0 ${
        selected
          ? "bg-[var(--color-surface-container)]"
          : "hover:bg-[var(--color-surface-low)]"
      } ${onSelect ? "cursor-pointer" : ""}`}
    >
      <InstalledThumb addon={addon} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <CategoryIcon categoryId={addon.category_id} />
          <h3 className="truncate text-[15px] font-medium text-[var(--color-on-surface)]">
            {addon.title}
          </h3>
          {addon.version ? (
            <span className="shrink-0 font-mono text-[11px] tracking-wide text-[var(--color-outline)]">
              v{addon.version}
            </span>
          ) : null}
        </div>
        <p className="truncate text-xs text-[var(--color-on-surface-variant)]">
          {addon.author ? `by ${addon.author}` : addon.dir_name}
        </p>
        <TimestampsLine addon={addon} />
      </div>

      <div className="flex shrink-0 items-center">
        <StatusText addon={addon} />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {addon.update_available && addon.catalog_id ? (
          <UpdateButton updating={updating} onUpdate={onUpdate} />
        ) : null}
        <UninstallButton uninstalling={uninstalling} onUninstall={onUninstall} />
      </div>
    </article>
  );
}
