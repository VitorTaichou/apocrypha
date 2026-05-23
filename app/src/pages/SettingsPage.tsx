import { useEffect, useState } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { PageHeader } from "@/components/PageHeader";
import { SnapshotsManager } from "@/components/SnapshotsManager";
import { UpdaterPanel } from "@/components/UpdaterPanel";
import { api } from "@/lib/api";
import type { CatalogMeta } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";

function SettingSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[var(--color-border)] py-8">
      <div className="grid gap-8 md:grid-cols-[300px_1fr]">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-[0.14em] text-[var(--color-on-surface)]">
            {title}
          </h2>
          <p className="mt-2 text-sm text-[var(--color-on-surface-variant)]">
            {description}
          </p>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </section>
  );
}

export function SettingsPage() {
  const [addonsDir, setAddonsDir] = useState("");
  const [meta, setMeta] = useState<CatalogMeta | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    api.getAddonsDir().then(setAddonsDir).catch(() => {});
    api.catalogMeta().then(setMeta).catch(() => {});
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const m = await api.syncCatalog();
      setMeta(m);
    } catch (e) {
      setSyncError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function handlePathChange(value: string) {
    setAddonsDir(value);
    try {
      await api.setAddonsDir(value);
    } catch {
      // silently ignore for MVP
    }
  }

  async function handleBrowse() {
    try {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: "Select your ESO AddOns folder",
        defaultPath: addonsDir || undefined,
      });
      if (typeof picked === "string" && picked) {
        await handlePathChange(picked);
      }
    } catch (e) {
      console.error("folder picker failed:", e);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Settings"
        subtitle="Configure paths, automation, and diagnostics."
      />

      <div className="flex-1 overflow-y-auto px-10 pb-12">
        <SettingSection
          title="AddOns Folder"
          description="Where your ESO addons are installed. Edit if you have a non-standard ESO install."
        >
          <div className="flex gap-2">
            <input
              value={addonsDir}
              onChange={(e) => handlePathChange(e.target.value)}
              className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-lowest)] px-4 py-2.5 font-mono text-sm text-[var(--color-on-surface)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            <button
              onClick={handleBrowse}
              className="inline-flex shrink-0 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-2.5 text-sm text-[var(--color-on-surface-variant)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              <FolderOpen className="h-4 w-4" strokeWidth={1.75} />
              Browse...
            </button>
          </div>
        </SettingSection>

        <SettingSection
          title="Catalog"
          description="Synchronization with the ESOUI archive."
        >
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-[var(--color-on-surface)]">
              <div>
                {meta && meta.addon_count > 0
                  ? `${meta.addon_count.toLocaleString()} addons indexed`
                  : "Catalog is empty"}
              </div>
              <div className="mt-0.5 text-xs text-[var(--color-outline)]">
                Last sync: {formatRelativeTime(meta?.last_synced ?? null)}
              </div>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary-container)] px-4 py-2 text-sm font-medium text-[var(--color-on-primary)] hover:bg-[var(--color-primary)] disabled:opacity-60"
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                  Syncing...
                </>
              ) : (
                "Sync now"
              )}
            </button>
          </div>
          {syncError ? (
            <p className="text-xs text-[var(--color-error)]">{syncError}</p>
          ) : null}
        </SettingSection>

        <SettingSection
          title="SavedVariables Backups"
          description="Snapshots of your live/SavedVariables folder. A snapshot is taken automatically before each addon update; you can also create one manually any time."
        >
          <SnapshotsManager />
        </SettingSection>

        <SettingSection
          title="Auto-update"
          description="Keep addons fresh without thinking about it."
        >
          <label className="flex items-center justify-between gap-4">
            <span className="text-base text-[var(--color-on-surface)]">
              Update silently when the game is closed
            </span>
            <span className="text-sm text-[var(--color-outline)]">Coming soon</span>
          </label>
        </SettingSection>

        <SettingSection
          title="App Updates"
          description="Apocrypha can update itself from the official release feed."
        >
          <UpdaterPanel />
        </SettingSection>

        <SettingSection
          title="About"
          description="Version, links, and credits."
        >
          <div className="space-y-1.5 text-base text-[var(--color-on-surface-variant)]">
            <p>Apocrypha v0.1.0 — codename Archivist</p>
            <p className="text-sm text-[var(--color-outline)]">
              Built with Tauri 2, Rust, React, and Tailwind.
            </p>
          </div>
        </SettingSection>
      </div>
    </div>
  );
}
