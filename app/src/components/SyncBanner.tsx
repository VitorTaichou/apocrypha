import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

export type SyncStatus =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "done"; addonCount: number }
  | { kind: "error"; message: string };

interface Props {
  status: SyncStatus;
}

export function SyncBanner({ status }: Props) {
  if (status.kind === "idle") return null;

  if (status.kind === "syncing") {
    return (
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-primary-container)]/10 px-10 py-2.5 text-sm text-[var(--color-on-surface-variant)]">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" strokeWidth={1.75} />
        <span>Updating the archive from ESOUI...</span>
      </div>
    );
  }

  if (status.kind === "done") {
    return (
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-primary-container)]/10 px-10 py-2.5 text-sm text-[var(--color-on-surface-variant)]">
        <CheckCircle2 className="h-4 w-4 text-[var(--color-primary)]" strokeWidth={1.75} />
        <span>
          Archive up to date · {status.addonCount.toLocaleString()} addons indexed
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-error-container)]/15 px-10 py-2.5 text-sm text-[var(--color-error)]">
      <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
      <span>Sync failed: {status.message}</span>
    </div>
  );
}
