import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface LightboxProps {
  images: string[];
  startIndex: number;
  onClose: () => void;
}

export function Lightbox({ images, startIndex, onClose }: LightboxProps) {
  const [index, setIndex] = useState(startIndex);

  const prev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : images.length - 1));
  }, [images.length]);

  const next = useCallback(() => {
    setIndex((i) => (i < images.length - 1 ? i + 1 : 0));
  }, [images.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  // Body scroll lock while open.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  if (images.length === 0) return null;
  const showNav = images.length > 1;
  const src = images[index];

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label="Image viewer"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm"
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close viewer"
        className="absolute right-5 top-5 rounded-full bg-[var(--color-surface)]/80 p-2 text-[var(--color-on-surface-variant)] backdrop-blur-sm hover:bg-[var(--color-surface)] hover:text-[var(--color-on-surface)]"
      >
        <X className="h-5 w-5" strokeWidth={2} />
      </button>

      {showNav ? (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label="Previous image"
            className="absolute left-5 top-1/2 -translate-y-1/2 rounded-full bg-[var(--color-surface)]/80 p-2 text-[var(--color-on-surface-variant)] backdrop-blur-sm hover:bg-[var(--color-surface)] hover:text-[var(--color-on-surface)]"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label="Next image"
            className="absolute right-5 top-1/2 -translate-y-1/2 rounded-full bg-[var(--color-surface)]/80 p-2 text-[var(--color-on-surface-variant)] backdrop-blur-sm hover:bg-[var(--color-surface)] hover:text-[var(--color-on-surface)]"
          >
            <ChevronRight className="h-6 w-6" strokeWidth={2} />
          </button>
        </>
      ) : null}

      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[90vw] cursor-default object-contain shadow-2xl shadow-black"
      />

      {showNav ? (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-surface)]/80 px-3 py-1 font-mono text-xs text-[var(--color-on-surface-variant)] backdrop-blur-sm">
          {index + 1} / {images.length}
        </div>
      ) : null}
    </div>
  );
}
