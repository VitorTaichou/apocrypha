import { useCallback, useEffect, useMemo, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  ArrowUpCircle,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Search as SearchIcon,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { InstalledRow } from "@/components/InstalledRow";
import { AddonDetailPanel } from "@/components/AddonDetailPanel";
import { api } from "@/lib/api";
import type { Addon, InstalledAddon } from "@/lib/types";

export function InstalledPage() {
  const [addons, setAddons] = useState<InstalledAddon[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<Set<string>>(new Set());
  const [updatingCatalogIds, setUpdatingCatalogIds] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [query, setQuery] = useState("");

  const [selectedCatalogAddon, setSelectedCatalogAddon] = useState<Addon | null>(null);
  const [selectedInstalled, setSelectedInstalled] = useState<InstalledAddon | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .listInstalled()
      .then(setAddons)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    (async () => {
      unlisteners.push(
        await listen<{ id: string }>("addon:install:start", (e) => {
          setUpdatingCatalogIds((prev) => {
            const next = new Set(prev);
            next.add(e.payload.id);
            return next;
          });
        }),
      );
      unlisteners.push(
        await listen<{ id: string }>("addon:install:done", (e) => {
          setUpdatingCatalogIds((prev) => {
            const next = new Set(prev);
            next.delete(e.payload.id);
            return next;
          });
          reload();
        }),
      );
      unlisteners.push(
        await listen<{ id: string; error: string }>("addon:install:error", (e) => {
          setUpdatingCatalogIds((prev) => {
            const next = new Set(prev);
            next.delete(e.payload.id);
            return next;
          });
          console.error("install/update failed:", e.payload.error);
        }),
      );
      unlisteners.push(
        await listen<{ dir_name: string }>("addon:uninstall:done", (e) => {
          setUninstalling((prev) => {
            const next = new Set(prev);
            next.delete(e.payload.dir_name);
            return next;
          });
          if (selectedInstalled?.dir_name === e.payload.dir_name) {
            setSelectedCatalogAddon(null);
            setSelectedInstalled(null);
          }
          reload();
        }),
      );
      unlisteners.push(
        await listen<{ dir_name: string; error: string }>(
          "addon:uninstall:error",
          (e) => {
            setUninstalling((prev) => {
              const next = new Set(prev);
              next.delete(e.payload.dir_name);
              return next;
            });
            console.error("uninstall failed:", e.payload.error);
          },
        ),
      );
    })();
    return () => unlisteners.forEach((fn) => fn());
    // selectedInstalled is intentionally not in deps — we read its current value
    // inside the listener via closure but never want to re-subscribe on selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const handleUninstall = useCallback(async (addon: InstalledAddon) => {
    setUninstalling((prev) => {
      const next = new Set(prev);
      next.add(addon.dir_name);
      return next;
    });
    try {
      await api.uninstallAddon(addon.dir_name);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleUpdate = useCallback(async (addon: InstalledAddon) => {
    if (!addon.catalog_id) return;
    try {
      await api.installAddon(addon.catalog_id);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleSelect = useCallback(async (addon: InstalledAddon) => {
    if (!addon.catalog_id) return;
    setSelectedInstalled(addon);
    try {
      const catalog = await api.getAddonById(addon.catalog_id);
      if (catalog) setSelectedCatalogAddon(catalog);
    } catch (e) {
      console.error("failed to load catalog data:", e);
    }
  }, []);

  const closePanel = useCallback(() => {
    setSelectedCatalogAddon(null);
    setSelectedInstalled(null);
  }, []);

  const updatesAvailable = useMemo(
    () => addons?.filter((a) => a.update_available).length ?? 0,
    [addons],
  );

  const filteredAddons = useMemo(() => {
    if (!addons) return null;
    const q = query.trim().toLowerCase();
    if (!q) return addons;
    return addons.filter((a) => {
      const title = a.title.toLowerCase();
      const dir = a.dir_name.toLowerCase();
      const author = (a.author ?? "").toLowerCase();
      return title.includes(q) || dir.includes(q) || author.includes(q);
    });
  }, [addons, query]);

  const handleUpdateAll = useCallback(async () => {
    if (!addons) return;
    const toUpdate = addons.filter((a) => a.update_available && a.catalog_id);
    if (toUpdate.length === 0) return;
    setBulkProgress({ done: 0, total: toUpdate.length });
    for (let i = 0; i < toUpdate.length; i++) {
      const addon = toUpdate[i];
      try {
        await api.installAddon(addon.catalog_id!);
      } catch (e) {
        console.error(`update failed for ${addon.title}:`, e);
      }
      setBulkProgress({ done: i + 1, total: toUpdate.length });
    }
    setBulkProgress(null);
  }, [addons]);

  // Re-resolve selectedInstalled against the latest list so the panel reflects fresh data
  // (version bumps, update_available flips) without the user having to reopen it.
  const currentSelectedInstalled = useMemo(() => {
    if (!selectedInstalled || !addons) return selectedInstalled;
    return addons.find((a) => a.dir_name === selectedInstalled.dir_name) ?? null;
  }, [selectedInstalled, addons]);

  const panelAction = useMemo(() => {
    if (!selectedCatalogAddon || !currentSelectedInstalled) return null;
    const inst = currentSelectedInstalled;
    if (uninstalling.has(inst.dir_name)) {
      return { kind: "uninstalling" } as const;
    }
    if (inst.catalog_id && updatingCatalogIds.has(inst.catalog_id)) {
      return { kind: "updating" } as const;
    }
    if (inst.update_available && inst.catalog_version) {
      return {
        kind: "update",
        targetVersion: inst.catalog_version,
      } as const;
    }
    return { kind: "uninstall" } as const;
  }, [selectedCatalogAddon, currentSelectedInstalled, uninstalling, updatingCatalogIds]);

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          title="Installed"
          subtitle={
            addons
              ? `${addons.length} addon${addons.length === 1 ? "" : "s"} in your library${
                  updatesAvailable > 0
                    ? ` · ${updatesAvailable} update${updatesAvailable === 1 ? "" : "s"} available`
                    : ""
                }`
              : "Your library, updates, and dependency health."
          }
          actions={
            <>
              {updatesAvailable > 0 || bulkProgress ? (
                <button
                  onClick={handleUpdateAll}
                  disabled={!!bulkProgress}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary-container)]/20 px-4 py-2 text-sm font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-container)]/35 disabled:opacity-70"
                >
                  {bulkProgress ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                      Updating {Math.min(bulkProgress.done + 1, bulkProgress.total)} of {bulkProgress.total}
                    </>
                  ) : (
                    <>
                      <ArrowUpCircle className="h-4 w-4" strokeWidth={1.75} />
                      Update All ({updatesAvailable})
                    </>
                  )}
                </button>
              ) : null}
              <button
                onClick={reload}
                disabled={loading || !!bulkProgress}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-2 text-sm text-[var(--color-on-surface-variant)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                ) : (
                  <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
                )}
                Re-scan
              </button>
            </>
          }
        />

        {addons && addons.length > 0 ? (
          <div className="px-10 pb-6 pt-8">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-outline)]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter installed addons..."
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-lowest)] py-3.5 pl-12 pr-4 text-base text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-10 pb-8">
          {loading && !addons ? (
            <EmptyState
              icon={<Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />}
              title="Scanning your AddOns folder..."
            />
          ) : error ? (
            <EmptyState
              icon={<AlertTriangle className="h-6 w-6 text-[var(--color-error)]" />}
              title="Failed to scan your AddOns folder."
              subtitle={error}
            />
          ) : addons && addons.length === 0 ? (
            <EmptyState
              title="No addons indexed yet."
              subtitle="ESO either isn't installed or your AddOns folder is empty. Check Settings → AddOns Folder."
            />
          ) : filteredAddons && filteredAddons.length === 0 ? (
            <EmptyState
              title="No matches."
              subtitle={`Nothing in your library matches "${query}". Clear the filter to see all ${addons?.length ?? 0} addons.`}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-lowest)]">
              {filteredAddons?.map((a) => (
                <InstalledRow
                  key={a.dir_name}
                  addon={a}
                  uninstalling={uninstalling.has(a.dir_name)}
                  updating={a.catalog_id ? updatingCatalogIds.has(a.catalog_id) : false}
                  selected={selectedInstalled?.dir_name === a.dir_name}
                  onUninstall={() => handleUninstall(a)}
                  onUpdate={() => handleUpdate(a)}
                  onSelect={a.catalog_id ? () => handleSelect(a) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedCatalogAddon && currentSelectedInstalled && panelAction ? (
        <AddonDetailPanel
          key={selectedCatalogAddon.id}
          addon={selectedCatalogAddon}
          action={panelAction}
          installedDirName={currentSelectedInstalled.dir_name}
          onClose={closePanel}
          onUpdate={() => handleUpdate(currentSelectedInstalled)}
          onUninstall={() => handleUninstall(currentSelectedInstalled)}
        />
      ) : null}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="grid h-full place-items-center rounded-lg border border-dashed border-[var(--color-border)] text-center">
      <div className="max-w-md px-6">
        {icon ? <div className="mb-3 flex justify-center">{icon}</div> : null}
        <p className="text-lg font-medium text-[var(--color-on-surface-variant)]">
          {title}
        </p>
        {subtitle ? (
          <p className="mt-2 text-sm text-[var(--color-outline)]">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}
