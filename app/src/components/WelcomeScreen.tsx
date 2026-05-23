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
    <div className="fixed inset-0 z-[100] flex bg-[var(--color-surface)]">
      {/* Left half — the chest takes centre stage on a slightly darker panel */}
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface-lowest)] md:flex">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(103,217,202,0.10),transparent_70%)]"
        />
        <img
          src="/sidebar-decor.png"
          alt=""
          draggable={false}
          className="relative max-h-[78vh] w-auto select-none drop-shadow-[0_25px_45px_rgba(0,0,0,0.55)]"
        />
      </div>

      {/* Right half — instructions card */}
      <div className="flex flex-1 items-center justify-center px-8 py-10">
        <div className="w-full max-w-[440px]">
          <div className="flex flex-col items-center text-center">
            <TentacleMark
              className="h-12 w-12 text-[var(--color-primary)]"
              title="Apocrypha"
            />
            <h1 className="mt-5 font-serif text-4xl font-light leading-none tracking-tight text-[var(--color-primary)]">
              APOCRYPHA
            </h1>
            <p className="mt-3 text-sm text-[var(--color-on-surface-variant)]">
              A modern addon manager for The Elder Scrolls Online.
            </p>
          </div>

          <div className="mt-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-lowest)] p-5">
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

          <p className="mt-5 text-xs text-[var(--color-outline)]">
            The catalog is syncing in the background. You can start browsing
            right away — it'll fill in as it lands.
          </p>

          <button
            onClick={handleStart}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary-container)]/20 px-5 py-3 text-sm font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-container)]/35"
          >
            Get started →
          </button>
        </div>
      </div>
    </div>
  );
}
