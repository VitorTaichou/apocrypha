import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Loader2,
  RotateCcw,
  Trash2,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Snapshot } from "@/lib/types";
import { formatBytes, formatRelativeTime } from "@/lib/format";

function KindBadge({ snapshot }: { snapshot: Snapshot }) {
  const isAuto = snapshot.kind === "auto";
  const Icon = isAuto ? Zap : Camera;
  const label = isAuto
    ? snapshot.trigger
      ? `Auto · before updating ${snapshot.trigger}`
      : "Auto"
    : "Manual";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        isAuto
          ? "bg-[var(--color-surface-low)] text-[var(--color-outline)]"
          : "bg-[var(--color-primary-container)]/15 text-[var(--color-primary)]"
      }`}
    >
      <Icon className="h-3 w-3" strokeWidth={1.75} />
      {label}
    </span>
  );
}

export function SnapshotsManager() {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listSnapshots();
      setSnapshots(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate() {
    setBusy("create");
    setError(null);
    setInfo(null);
    try {
      const snap = await api.createSnapshot();
      setInfo(`Snapshot saved · ${snap.file_count} files (${formatBytes(snap.total_size_bytes)})`);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleRestore(snap: Snapshot) {
    const ok = window.confirm(
      `Restore ${snap.file_count} file(s) from ${formatRelativeTime(snap.created_at)}?\n\nExisting SavedVariables files will be overwritten. Files only present in your current state will be left in place.`,
    );
    if (!ok) return;

    setBusy(`restore:${snap.id}`);
    setError(null);
    setInfo(null);
    try {
      const n = await api.restoreSnapshot(snap.id);
      setInfo(`Restored ${n} file${n === 1 ? "" : "s"} from snapshot.`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(snap: Snapshot) {
    const ok = window.confirm(
      `Permanently delete this snapshot (${snap.file_count} files, ${formatBytes(snap.total_size_bytes)})?`,
    );
    if (!ok) return;

    setBusy(`delete:${snap.id}`);
    setError(null);
    setInfo(null);
    try {
      await api.deleteSnapshot(snap.id);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-on-surface-variant)]">
          {snapshots
            ? `${snapshots.length} snapshot${snapshots.length === 1 ? "" : "s"} stored`
            : "Loading snapshots..."}
        </p>
        <button
          onClick={handleCreate}
          disabled={busy === "create"}
          className="inline-flex items-center gap-2 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary-container)]/15 px-3.5 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-container)]/30 disabled:opacity-60"
        >
          {busy === "create" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <Camera className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          Create snapshot
        </button>
      </div>

      {info ? (
        <p className="rounded-md border border-[var(--color-primary-container)]/30 bg-[var(--color-primary-container)]/10 px-3 py-2 text-xs text-[var(--color-primary)]">
          {info}
        </p>
      ) : null}
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error-container)]/15 px-3 py-2 text-xs text-[var(--color-error)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {error}
        </div>
      ) : null}

      {loading && !snapshots ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-[var(--color-border)] px-4 py-6 text-sm text-[var(--color-outline)]">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
          Loading...
        </div>
      ) : snapshots && snapshots.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] px-4 py-6 text-center text-sm text-[var(--color-outline)]">
          No snapshots yet — create one before touching an addon you can't
          afford to lose configs for.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-lowest)]">
          {snapshots?.map((snap) => {
            const isRestoring = busy === `restore:${snap.id}`;
            const isDeleting = busy === `delete:${snap.id}`;
            return (
              <li
                key={snap.id}
                className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--color-surface-low)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-on-surface)]">
                      {formatRelativeTime(snap.created_at)}
                    </span>
                    <KindBadge snapshot={snap} />
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-[var(--color-outline)]">
                    {snap.file_count} files · {formatBytes(snap.total_size_bytes)}
                  </p>
                </div>
                <button
                  onClick={() => handleRestore(snap)}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-1.5 text-xs font-medium text-[var(--color-on-surface-variant)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                >
                  {isRestoring ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                  )}
                  Restore
                </button>
                <button
                  onClick={() => handleDelete(snap)}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-1.5 text-xs font-medium text-[var(--color-on-surface-variant)] hover:border-[var(--color-error)] hover:text-[var(--color-error)] disabled:opacity-50"
                >
                  {isDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  )}
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
