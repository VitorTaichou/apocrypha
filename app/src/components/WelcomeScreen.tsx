import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { TentacleMark } from "@/components/TentacleMark";
import { api } from "@/lib/api";

const STORAGE_KEY = "apocrypha:welcome-shown";

export function welcomeAlreadyShown(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

interface WelcomeScreenProps {
  onDismiss: () => void;
}

export function WelcomeScreen({ onDismiss }: WelcomeScreenProps) {
  const [addonsDir, setAddonsDir] = useState<string>("");
  const [installedCount, setInstalledCount] = useState<number | null>(null);
  const [scanError, setScanError] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setScanError(false);
    try {
      const dir = await api.getAddonsDir();
      setAddonsDir(dir);
      try {
        const installed = await api.listInstalled();
        setInstalledCount(installed.length);
      } catch {
        setScanError(true);
        setInstalledCount(null);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleBrowse() {
    try {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: "Select your ESO AddOns folder",
        defaultPath: addonsDir || undefined,
      });
      if (typeof picked === "string" && picked) {
        await api.setAddonsDir(picked);
        await refresh();
      }
    } catch (e) {
      console.error("folder picker failed:", e);
    }
  }

  function handleStart() {
    window.localStorage.setItem(STORAGE_KEY, "true");
    onDismiss();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--color-surface)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-end justify-center"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.9) 90%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.9) 90%, transparent 100%)",
        }}
      >
        <img
          src="/sidebar-decor.png"
          alt=""
          className="h-[78vh] w-auto select-none opacity-[0.18]"
          draggable={false}
        />
      </div>

      <div className="relative z-10 w-[500px] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-lowest)]/95 shadow-2xl shadow-black/80 backdrop-blur-md">
        <div className="px-10 pt-12 pb-8 text-center">
          <TentacleMark
            className="mx-auto h-14 w-14 text-[var(--color-primary)]"
            title="Apocrypha"
          />
          <h1 className="mt-5 font-serif text-4xl font-light leading-none tracking-tight text-[var(--color-primary)]">
            APOCRYPHA
          </h1>
          <p className="mt-3 text-sm text-[var(--color-on-surface-variant)]">
            A modern addon manager for The Elder Scrolls Online.
          </p>
        </div>

        <div className="border-t border-[var(--color-border)] px-10 py-6">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--color-outline)]">
            AddOns Folder
          </h2>

          {busy && !addonsDir ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-[var(--color-on-surface-variant)]">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />
              Looking for your ESO install...
            </div>
          ) : (
            <>
              <p className="mt-2 break-all font-mono text-xs text-[var(--color-on-surface-variant)]">
                {addonsDir || "Not configured"}
              </p>
              <p className="mt-2 text-sm text-[var(--color-on-surface)]">
                {installedCount === null
                  ? scanError
                    ? "Couldn't read this folder yet — you can fix the path below or continue and adjust later in Settings."
                    : "Scanning..."
                  : installedCount > 0
                  ? `${installedCount.toLocaleString()} addon${installedCount === 1 ? "" : "s"} found, ready to manage.`
                  : "Folder is empty — install some addons to get started."}
              </p>
            </>
          )}

          <button
            onClick={handleBrowse}
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3.5 py-2 text-xs font-medium text-[var(--color-on-surface-variant)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
            Choose a different folder
          </button>
        </div>

        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-low)]/30 px-10 py-6">
          <p className="text-xs text-[var(--color-outline)]">
            The catalog is syncing in the background. You can start browsing
            right away — it'll fill in as it lands.
          </p>
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface-lowest)] px-10 py-5">
          <button
            onClick={handleStart}
            className="rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary-container)]/20 px-5 py-2.5 text-sm font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-container)]/35"
          >
            Get started →
          </button>
        </div>
      </div>
    </div>
  );
}
