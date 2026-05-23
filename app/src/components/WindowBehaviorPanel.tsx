import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { api } from "@/lib/api";
import { Toggle } from "@/components/Toggle";

export function WindowBehaviorPanel() {
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [closeToTray, setCloseToTray] = useState<boolean | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [a, c] = await Promise.all([
          isAutostartEnabled(),
          api.getCloseToTray(),
        ]);
        if (alive) {
          setAutostart(a);
          setCloseToTray(c);
        }
      } catch (e) {
        if (alive) setError(String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onAutostartToggle = useCallback(async (next: boolean) => {
    setPending("autostart");
    setError(null);
    try {
      if (next) await enableAutostart();
      else await disableAutostart();
      setAutostart(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(null);
    }
  }, []);

  const onCloseToTrayToggle = useCallback(async (next: boolean) => {
    setPending("tray");
    setError(null);
    try {
      await api.setCloseToTray(next);
      setCloseToTray(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(null);
    }
  }, []);

  return (
    <div className="space-y-4">
      <Toggle
        checked={autostart === true}
        onChange={onAutostartToggle}
        pending={pending === "autostart"}
        disabled={autostart === null}
        label="Start with Windows"
        description="Launch Apocrypha automatically when you sign in. It starts minimised to the system tray so it doesn't interrupt your boot."
      />

      <div className="h-px bg-[var(--color-border)]" />

      <Toggle
        checked={closeToTray === true}
        onChange={onCloseToTrayToggle}
        pending={pending === "tray"}
        disabled={closeToTray === null}
        label="Close to system tray instead of exit"
        description="Clicking the window's × button hides Apocrypha to the tray. Right-click the tray icon to quit fully."
      />

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error-container)]/15 px-3 py-2 text-xs text-[var(--color-error)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {error}
        </div>
      ) : null}
    </div>
  );
}
