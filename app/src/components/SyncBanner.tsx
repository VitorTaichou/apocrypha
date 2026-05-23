import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

export type SyncStatus =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "done"; addonCount: number }
  | { kind: "error"; message: string };

interface Props {
  status: SyncStatus;
}

function renderInner(status: SyncStatus) {
  if (status.kind === "syncing") {
    return (
      <div className="pointer-events-auto flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-primary-container)]/15 px-10 py-2.5 text-sm text-[var(--color-on-surface-variant)] shadow-lg shadow-black/20 backdrop-blur-md">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" strokeWidth={1.75} />
        <span>Updating the archive from ESOUI...</span>
      </div>
    );
  }
  if (status.kind === "done") {
    return (
      <div className="pointer-events-auto flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-primary-container)]/15 px-10 py-2.5 text-sm text-[var(--color-on-surface-variant)] shadow-lg shadow-black/20 backdrop-blur-md">
        <CheckCircle2 className="h-4 w-4 text-[var(--color-primary)]" strokeWidth={1.75} />
        <span>
          Archive up to date · {status.addonCount.toLocaleString()} addons indexed
        </span>
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div className="pointer-events-auto flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-error-container)]/20 px-10 py-2.5 text-sm text-[var(--color-error)] shadow-lg shadow-black/20 backdrop-blur-md">
        <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
        <span>Sync failed: {status.message}</span>
      </div>
    );
  }
  return null;
}

export function SyncBanner({ status }: Props) {
  const visible = status.kind !== "idle";

  return (
    <div
      aria-hidden={!visible}
      className={`pointer-events-none absolute inset-x-0 top-0 z-30 transition-all duration-300 ease-out ${
        visible
          ? "translate-y-0 opacity-100"
          : "-translate-y-3 opacity-0"
      }`}
    >
      {renderInner(status)}
    </div>
  );
}
