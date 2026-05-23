import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpCircle,
  Check,
  Download,
  ExternalLink,
  Heart,
  Loader2,
  Maximize2,
  Trash2,
  X,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Addon, AddonDetails } from "@/lib/types";
import { api } from "@/lib/api";
import { formatCount, formatRelativeTime } from "@/lib/format";
import { BBCodeContent } from "@/components/BBCodeContent";
import { getCategoryMeta } from "@/lib/categoryMeta";
import { Lightbox } from "@/components/Lightbox";

type ActionState =
  | { kind: "install" }
  | { kind: "installing" }
  | { kind: "installed" }
  | { kind: "update"; targetVersion: string }
  | { kind: "updating" }
  | { kind: "uninstall" }
  | { kind: "uninstalling" };

interface AddonDetailPanelProps {
  addon: Addon;
  action: ActionState;
  installedDirName?: string | null;
  onClose: () => void;
  onInstall?: () => void;
  onUpdate?: () => void;
  onUninstall?: () => void;
}

const WIDTH_STORAGE_KEY = "apocrypha:detail-panel-width";
const DEFAULT_WIDTH = 440;
const MIN_WIDTH = 320;
const MAX_WIDTH_PERCENT = 0.65;

function readStoredWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const raw = window.localStorage.getItem(WIDTH_STORAGE_KEY);
  if (!raw) return DEFAULT_WIDTH;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WIDTH;
}

function useDetailPanelWidth() {
  const [width, setWidth] = useState(readStoredWidth);

  // Clamp on window resize so the panel never exceeds the new viewport.
  useEffect(() => {
    function clamp() {
      const max = Math.floor(window.innerWidth * MAX_WIDTH_PERCENT);
      setWidth((current) => Math.min(Math.max(current, MIN_WIDTH), max));
    }
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);

  const setAndPersist = useCallback((next: number) => {
    const max = Math.floor(window.innerWidth * MAX_WIDTH_PERCENT);
    const clamped = Math.min(Math.max(next, MIN_WIDTH), max);
    setWidth(clamped);
    window.localStorage.setItem(WIDTH_STORAGE_KEY, String(clamped));
  }, []);

  return [width, setAndPersist] as const;
}

function ResizeHandle({ onResize }: { onResize: (width: number) => void }) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;

    function onMove(e: MouseEvent) {
      // Panel is glued to the right edge of the window, so dragging the left
      // edge towards the LEFT increases the panel width.
      onResize(window.innerWidth - e.clientX);
    }
    function onUp() {
      setDragging(false);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);

    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [dragging, onResize]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      onMouseDown={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDoubleClick={() => onResize(DEFAULT_WIDTH)}
      className="group absolute inset-y-0 left-0 z-30 w-1.5 -translate-x-1/2 cursor-col-resize"
      title="Drag to resize · double-click to reset"
    >
      <div
        className={`mx-auto h-full w-px transition-colors ${
          dragging
            ? "bg-[var(--color-primary)]"
            : "bg-transparent group-hover:bg-[var(--color-primary)]/70"
        }`}
      />
    </div>
  );
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function HeroImage({
  addon,
  onExpand,
}: {
  addon: Addon;
  onExpand: () => void;
}) {
  const [errored, setErrored] = useState(false);
  const src = addon.images[0] ?? addon.thumbnail_url ?? null;
  if (!src || errored) {
    return (
      <div className="relative flex h-40 items-center justify-center overflow-hidden bg-[var(--color-surface-low)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(103,217,202,0.18),transparent_60%)]" />
        <span className="relative text-4xl font-light uppercase tracking-wider text-[var(--color-primary)]/80">
          {initials(addon.name)}
        </span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label="Expand screenshot"
      className="group relative block h-40 w-full overflow-hidden bg-[var(--color-surface-low)]"
    >
      <img
        src={src}
        alt={addon.name}
        loading="lazy"
        decoding="async"
        onError={() => setErrored(true)}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--color-surface)]/80" />
      <span className="absolute right-3 top-3 rounded-md bg-[var(--color-surface)]/80 p-1.5 text-[var(--color-on-surface-variant)] opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
        <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
    </button>
  );
}

function ActionButton({
  action,
  onInstall,
  onUpdate,
  onUninstall,
}: {
  action: ActionState;
  onInstall?: () => void;
  onUpdate?: () => void;
  onUninstall?: () => void;
}) {
  const base =
    "flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium transition-colors";

  switch (action.kind) {
    case "installed":
      return (
        <div
          className={`${base} flex-1 border-[var(--color-primary-container)]/30 bg-[var(--color-primary-container)]/15 text-[var(--color-primary)]`}
        >
          <Check className="h-4 w-4" strokeWidth={2} />
          Installed
        </div>
      );
    case "installing":
      return (
        <div
          className={`${base} flex-1 border-[var(--color-border)] bg-[var(--color-surface-low)] text-[var(--color-primary)]`}
        >
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          Installing...
        </div>
      );
    case "install":
      return (
        <button
          onClick={onInstall}
          className={`${base} flex-1 border-[var(--color-primary)]/40 bg-[var(--color-primary-container)]/15 text-[var(--color-primary)] hover:bg-[var(--color-primary-container)]/30`}
        >
          <Download className="h-4 w-4" strokeWidth={1.75} />
          Install
        </button>
      );
    case "update":
      return (
        <button
          onClick={onUpdate}
          className={`${base} flex-1 border-[var(--color-primary)]/50 bg-[var(--color-primary-container)]/20 text-[var(--color-primary)] hover:bg-[var(--color-primary-container)]/35`}
        >
          <ArrowUpCircle className="h-4 w-4" strokeWidth={1.75} />
          Update to v{action.targetVersion}
        </button>
      );
    case "updating":
      return (
        <div
          className={`${base} flex-1 border-[var(--color-primary-container)]/40 bg-[var(--color-primary-container)]/20 text-[var(--color-primary)]`}
        >
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          Updating...
        </div>
      );
    case "uninstall":
      return (
        <button
          onClick={onUninstall}
          className={`${base} flex-1 border-[var(--color-border)] bg-[var(--color-surface-low)] text-[var(--color-on-surface-variant)] hover:border-[var(--color-error)] hover:text-[var(--color-error)]`}
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          Uninstall
        </button>
      );
    case "uninstalling":
      return (
        <div
          className={`${base} flex-1 border-[var(--color-border)] bg-[var(--color-surface-low)] text-[var(--color-error)]`}
        >
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          Removing...
        </div>
      );
  }
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[var(--color-border)] px-6 py-5">
      <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--color-outline)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ScreenshotStrip({
  images,
  onOpen,
}: {
  images: string[];
  onOpen: (index: number) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {images.map((url, i) => (
        <button
          key={`${i}-${url}`}
          type="button"
          onClick={() => onOpen(i)}
          aria-label={`Open screenshot ${i + 1}`}
          className="group relative h-20 w-32 shrink-0 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-low)] transition-colors hover:border-[var(--color-primary)]"
        >
          <img
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
            <Maximize2
              className="h-4 w-4 text-white opacity-0 transition-opacity group-hover:opacity-100"
              strokeWidth={1.75}
            />
          </span>
        </button>
      ))}
    </div>
  );
}

export function AddonDetailPanel({
  addon,
  action,
  installedDirName,
  onClose,
  onInstall,
  onUpdate,
  onUninstall,
}: AddonDetailPanelProps) {
  const [details, setDetails] = useState<AddonDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [panelWidth, setPanelWidth] = useDetailPanelWidth();

  useEffect(() => {
    setDetails(null);
    setDetailsError(null);
    setDetailsLoading(true);
    setLightboxIndex(null);
    let alive = true;
    api
      .getAddonDetails(addon.id)
      .then((d) => {
        if (alive) setDetails(d);
      })
      .catch((e) => {
        if (alive) setDetailsError(String(e));
      })
      .finally(() => {
        if (alive) setDetailsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [addon.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't close the panel while the lightbox is consuming Esc.
      if (e.key === "Escape" && lightboxIndex === null) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, lightboxIndex]);

  const meta = addon.category_id ? getCategoryMeta(addon.category_id) : null;
  const CategoryIconComp = meta?.icon;

  const description = details?.description ?? "";
  const changelog = details?.changelog ?? "";
  const galleryImages = addon.images;

  return (
    <>
      <aside
        className="relative flex h-full shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface-lowest)]"
        style={{ width: `${panelWidth}px` }}
      >
        <ResizeHandle onResize={setPanelWidth} />

        <div className="flex-1 overflow-y-auto">
          <div className="relative">
            <HeroImage
              addon={addon}
              onExpand={() => galleryImages.length > 0 && setLightboxIndex(0)}
            />
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-md bg-[var(--color-surface)]/70 p-1.5 text-[var(--color-on-surface-variant)] backdrop-blur-sm hover:bg-[var(--color-surface)] hover:text-[var(--color-on-surface)]"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <div className="px-6 pt-4">
            <div className="flex items-start gap-2">
              {CategoryIconComp ? (
                <CategoryIconComp
                  className="mt-1 h-4 w-4 shrink-0"
                  strokeWidth={1.75}
                  style={{ color: meta!.color }}
                />
              ) : null}
              <h2 className="text-xl font-semibold tracking-tight text-[var(--color-on-surface)]">
                {addon.name}
              </h2>
            </div>
            <p className="mt-1 text-sm text-[var(--color-on-surface-variant)]">
              by {addon.author || "Unknown"}
              {meta ? (
                <>
                  <span className="mx-2 text-[var(--color-outline-variant)]">·</span>
                  <span style={{ color: meta.color }}>{meta.title}</span>
                </>
              ) : null}
            </p>
            {addon.version ? (
              <p className="mt-2 inline-flex items-center gap-2 font-mono text-xs text-[var(--color-outline)]">
                v{addon.version}
                {installedDirName ? (
                  <span className="rounded-full bg-[var(--color-primary-container)]/15 px-2 py-0.5 text-[10px] text-[var(--color-primary)]">
                    Installed as {installedDirName}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2 px-6 pb-1 pt-4">
            <ActionButton
              action={action}
              onInstall={onInstall}
              onUpdate={onUpdate}
              onUninstall={onUninstall}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 px-6 pb-2 pt-4 text-xs text-[var(--color-on-surface-variant)]">
            <Stat label="Downloads" value={formatCount(addon.download_total)} icon={Download} />
            <Stat label="Favorites" value={formatCount(addon.favorite_total)} icon={Heart} />
            <Stat
              label="Updated"
              value={
                addon.last_updated
                  ? formatRelativeTime(addon.last_updated)
                  : "—"
              }
            />
          </div>

          {galleryImages.length > 1 ? (
            <Section title={`Screenshots (${galleryImages.length})`}>
              <ScreenshotStrip
                images={galleryImages}
                onOpen={(i) => setLightboxIndex(i)}
              />
            </Section>
          ) : null}

          <Section title="Description">
            {detailsLoading ? (
              <Skeleton lines={4} />
            ) : detailsError ? (
              <p className="text-sm text-[var(--color-error)]">{detailsError}</p>
            ) : description ? (
              <BBCodeContent text={description} />
            ) : (
              <p className="text-sm italic text-[var(--color-outline)]">
                No description provided.
              </p>
            )}
          </Section>

          {detailsLoading || changelog ? (
            <Section title="Changelog">
              {detailsLoading ? <Skeleton lines={3} /> : <BBCodeContent text={changelog} />}
            </Section>
          ) : null}

          {addon.file_info_url ? (
            <Section title="Source">
              <button
                onClick={() => {
                  if (addon.file_info_url) openUrl(addon.file_info_url).catch(() => {});
                }}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-1.5 text-xs font-medium text-[var(--color-on-surface-variant)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                Open on ESOUI
              </button>
            </Section>
          ) : null}
        </div>
      </aside>

      {lightboxIndex !== null && galleryImages.length > 0 ? (
        <Lightbox
          images={galleryImages}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof Download;
}) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-outline)]">
        {label}
      </div>
      <div className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-on-surface)]">
        {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={1.75} /> : null}
        {value}
      </div>
    </div>
  );
}

function Skeleton({ lines }: { lines: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded bg-[var(--color-surface-high)]/40"
          style={{ width: `${80 - (i % 3) * 15}%` }}
        />
      ))}
    </div>
  );
}
