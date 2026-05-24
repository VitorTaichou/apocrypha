import { useState } from "react";
import {
  Check,
  Download,
  DownloadCloud,
  Heart,
  Loader2,
  Trash2,
} from "lucide-react";
import type { Addon } from "@/lib/types";
import { formatCount } from "@/lib/format";
import { CategoryIcon } from "@/components/CategoryIcon";

interface AddonRowProps {
  addon: Addon;
  installing?: boolean;
  installed?: boolean;
  uninstalling?: boolean;
  selected?: boolean;
  onInstall?: () => void;
  onUninstall?: () => void;
  onSelect?: () => void;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function AddonThumb({ addon }: { addon: Addon }) {
  const [errored, setErrored] = useState(false);
  const src = addon.thumbnail_url ?? addon.images[0] ?? null;

  if (!src || errored) {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-low)] text-[11px] font-medium uppercase tracking-wider text-[var(--color-primary)]/80">
        {initials(addon.name)}
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

const ACTION_BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium w-[108px]";

function ActionButton({
  installing,
  installed,
  uninstalling,
  onInstall,
  onUninstall,
}: {
  installing: boolean;
  installed: boolean;
  uninstalling: boolean;
  onInstall?: () => void;
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

  if (installing) {
    return (
      <span
        className={`${ACTION_BASE} border-[var(--color-border)] bg-[var(--color-surface-low)] text-[var(--color-primary)]`}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        Installing
      </span>
    );
  }

  if (installed) {
    // Default: looks like a confirmation badge (Installed). On hover: swaps to
    // a destructive "Uninstall" affordance — same pattern as Twitter's
    // Following → Unfollow.
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onUninstall?.();
        }}
        className={`${ACTION_BASE} group/installed border-[var(--color-primary-container)]/30 bg-[var(--color-primary-container)]/15 text-[var(--color-primary)] transition-colors group-hover:border-[var(--color-primary-container)]/65 hover:!border-[var(--color-error)]/45 hover:bg-[var(--color-error-container)]/15 hover:text-[var(--color-error)]`}
      >
        <span className="inline-flex items-center gap-1.5 group-hover/installed:hidden">
          <Check className="h-3.5 w-3.5" strokeWidth={2} />
          Installed
        </span>
        <span className="hidden items-center gap-1.5 group-hover/installed:inline-flex">
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          Uninstall
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onInstall?.();
      }}
      className={`${ACTION_BASE} border-[var(--color-border)] bg-[var(--color-surface-low)] text-[var(--color-on-surface-variant)] transition-colors group-hover:border-[var(--color-on-surface-variant)]/40 group-hover:bg-[var(--color-surface-lowest)] hover:!border-[var(--color-primary)] hover:text-[var(--color-primary)]`}
    >
      <DownloadCloud className="h-3.5 w-3.5" strokeWidth={1.75} />
      Install
    </button>
  );
}

export function AddonRow({
  addon,
  installing = false,
  installed = false,
  uninstalling = false,
  selected = false,
  onInstall,
  onUninstall,
  onSelect,
}: AddonRowProps) {
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
      <AddonThumb addon={addon} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <CategoryIcon categoryId={addon.category_id} />
          <h3 className="truncate text-[15px] font-medium text-[var(--color-on-surface)]">
            {addon.name}
          </h3>
          {addon.version ? (
            <span className="shrink-0 font-mono text-[11px] tracking-wide text-[var(--color-outline)]">
              v{addon.version}
            </span>
          ) : null}
        </div>
        <p className="truncate text-xs text-[var(--color-on-surface-variant)]">
          by {addon.author || "Unknown"}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-5 text-xs text-[var(--color-on-surface-variant)]">
        <span className="inline-flex items-center gap-1.5">
          <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
          {formatCount(addon.download_total)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5" strokeWidth={1.75} />
          {formatCount(addon.favorite_total)}
        </span>
      </div>

      <ActionButton
        installing={installing}
        installed={installed}
        uninstalling={uninstalling}
        onInstall={onInstall}
        onUninstall={onUninstall}
      />
    </article>
  );
}
