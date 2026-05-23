import { useCallback, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  AlertTriangle,
  ArrowUpCircle,
  Check,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up-to-date" }
  | { kind: "available"; update: Update }
  | { kind: "installing"; downloaded: number; total: number | null }
  | { kind: "installed" }
  | { kind: "error"; message: string };

function formatProgress(downloaded: number, total: number | null): string {
  const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
  if (total) return `${mb(downloaded)} / ${mb(total)} MB`;
  return `${mb(downloaded)} MB`;
}

export function UpdaterPanel() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const handleCheck = useCallback(async () => {
    setStatus({ kind: "checking" });
    try {
      const update = await check();
      if (update) {
        setStatus({ kind: "available", update });
      } else {
        setStatus({ kind: "up-to-date" });
      }
    } catch (e) {
      setStatus({ kind: "error", message: String(e) });
    }
  }, []);

  const handleInstall = useCallback(async (update: Update) => {
    setStatus({ kind: "installing", downloaded: 0, total: null });
    try {
      let downloaded = 0;
      let total: number | null = null;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
          setStatus({ kind: "installing", downloaded: 0, total });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setStatus({ kind: "installing", downloaded, total });
        } else if (event.event === "Finished") {
          setStatus({ kind: "installed" });
        }
      });
    } catch (e) {
      setStatus({ kind: "error", message: String(e) });
    }
  }, []);

  const handleRestart = useCallback(async () => {
    try {
      await relaunch();
    } catch (e) {
      setStatus({ kind: "error", message: String(e) });
    }
  }, []);

  return (
    <div className="space-y-3">
      {status.kind === "idle" || status.kind === "checking" ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--color-on-surface-variant)]">
            {status.kind === "checking"
              ? "Reaching out to the release endpoint..."
              : "Check the release endpoint for a newer Apocrypha build."}
          </p>
          <button
            onClick={handleCheck}
            disabled={status.kind === "checking"}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3.5 py-1.5 text-xs font-medium text-[var(--color-on-surface-variant)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-60"
          >
            {status.kind === "checking" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            Check now
          </button>
        </div>
      ) : null}

      {status.kind === "up-to-date" ? (
        <div className="flex items-center justify-between rounded-md border border-[var(--color-primary-container)]/30 bg-[var(--color-primary-container)]/10 px-3 py-2.5 text-sm text-[var(--color-primary)]">
          <span className="inline-flex items-center gap-2">
            <Check className="h-4 w-4" strokeWidth={2} />
            You're on the latest version.
          </span>
          <button
            onClick={handleCheck}
            className="text-[11px] uppercase tracking-wider text-[var(--color-primary)] hover:underline"
          >
            Check again
          </button>
        </div>
      ) : null}

      {status.kind === "available" ? (
        <div className="space-y-3 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary-container)]/10 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--color-on-surface)]">
                New version available: v{status.update.version}
              </p>
              {status.update.currentVersion ? (
                <p className="mt-0.5 font-mono text-[11px] text-[var(--color-outline)]">
                  You're on v{status.update.currentVersion}
                </p>
              ) : null}
            </div>
            <button
              onClick={() => handleInstall(status.update)}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--color-primary)]/50 bg-[var(--color-primary-container)]/25 px-3.5 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-container)]/40"
            >
              <ArrowUpCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
              Install update
            </button>
          </div>
          {status.update.body ? (
            <p className="whitespace-pre-wrap text-xs text-[var(--color-on-surface-variant)]">
              {status.update.body}
            </p>
          ) : null}
        </div>
      ) : null}

      {status.kind === "installing" ? (
        <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-2.5 text-sm text-[var(--color-on-surface)]">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />
            Downloading update... {formatProgress(status.downloaded, status.total)}
          </span>
        </div>
      ) : null}

      {status.kind === "installed" ? (
        <div className="flex items-center justify-between rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary-container)]/15 px-3 py-2.5 text-sm text-[var(--color-primary)]">
          <span className="inline-flex items-center gap-2">
            <Check className="h-4 w-4" strokeWidth={2} />
            Update installed. Restart Apocrypha to finish.
          </span>
          <button
            onClick={handleRestart}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-primary)]/50 bg-[var(--color-primary-container)]/25 px-3.5 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-container)]/40"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
            Restart now
          </button>
        </div>
      ) : null}

      {status.kind === "error" ? (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error-container)]/15 px-3 py-2.5 text-xs text-[var(--color-error)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <div className="flex-1">
            <p>{status.message}</p>
            <button
              onClick={handleCheck}
              className="mt-2 text-[11px] uppercase tracking-wider text-[var(--color-error)] hover:underline"
            >
              Try again
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
