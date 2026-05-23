import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Sidebar, type PageId } from "@/components/Sidebar";
import { SyncBanner, type SyncStatus } from "@/components/SyncBanner";
import { Toaster, useToasts } from "@/components/Toaster";
import { WelcomeScreen, welcomeAlreadyShown } from "@/components/WelcomeScreen";
import { SearchPage } from "@/pages/SearchPage";
import { InstalledPage } from "@/pages/InstalledPage";
import { SettingsPage } from "@/pages/SettingsPage";
import type { CatalogMeta } from "@/lib/types";

function App() {
  const [page, setPage] = useState<PageId>("search");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: "idle" });
  const [catalogTick, setCatalogTick] = useState(0);
  const [showWelcome, setShowWelcome] = useState(() => !welcomeAlreadyShown());
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    let doneTimer: ReturnType<typeof setTimeout> | undefined;
    let errorTimer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      unlisteners.push(
        await listen("catalog:sync:start", () => {
          if (doneTimer) clearTimeout(doneTimer);
          if (errorTimer) clearTimeout(errorTimer);
          setSyncStatus({ kind: "syncing" });
        }),
      );
      unlisteners.push(
        await listen<CatalogMeta>("catalog:sync:done", (e) => {
          setSyncStatus({ kind: "done", addonCount: e.payload.addon_count });
          setCatalogTick((t) => t + 1);
          doneTimer = setTimeout(() => setSyncStatus({ kind: "idle" }), 4000);
        }),
      );
      unlisteners.push(
        await listen<string>("catalog:sync:error", (e) => {
          setSyncStatus({ kind: "error", message: e.payload });
          errorTimer = setTimeout(() => setSyncStatus({ kind: "idle" }), 6000);
        }),
      );

      unlisteners.push(
        await listen<{ id: string; error: string }>("addon:install:error", (e) => {
          pushToast({
            tone: "error",
            title: "Install failed",
            body: e.payload.error,
          });
        }),
      );
      unlisteners.push(
        await listen<{ dir_name: string; error: string }>(
          "addon:uninstall:error",
          (e) => {
            pushToast({
              tone: "error",
              title: `Couldn't uninstall ${e.payload.dir_name}`,
              body: e.payload.error,
            });
          },
        ),
      );
    })();

    return () => {
      unlisteners.forEach((fn) => fn());
      if (doneTimer) clearTimeout(doneTimer);
      if (errorTimer) clearTimeout(errorTimer);
    };
  }, [pushToast]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-surface)] text-[var(--color-on-surface)]">
      <Sidebar current={page} onNavigate={setPage} />
      <main className="relative flex flex-1 flex-col overflow-hidden bg-[var(--color-surface)]">
        <SyncBanner status={syncStatus} />
        <div className="flex-1 overflow-hidden" key={catalogTick}>
          {page === "search" && <SearchPage />}
          {page === "installed" && <InstalledPage />}
          {page === "settings" && <SettingsPage />}
        </div>
      </main>
      <Toaster toasts={toasts} onDismiss={dismissToast} />
      {showWelcome ? (
        <WelcomeScreen onDismiss={() => setShowWelcome(false)} />
      ) : null}
    </div>
  );
}

export default App;
