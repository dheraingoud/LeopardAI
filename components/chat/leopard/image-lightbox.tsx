"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { DownloadIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ghostButton, floating } from "./surfaces";

// Image lightbox (aui image-gallery port, 2026-10-10): attachment + generated
// images rendered bare <img> with no zoom and no download — on mobile the
// max-h-64 crop made them unreadable. Click opens a full-viewport overlay;
// Esc / backdrop / ✕ close; Download saves the file.
export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const download = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = alt || "image";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Image preview"}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* a11y: the dialog traps focus via the close button; Esc + backdrop
          both dismiss. */}
      <button
        type="button"
        aria-label="Close image preview"
        onClick={onClose}
        className={cn(
          floating,
          "absolute top-4 right-4 size-9 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#ffb400]/60",
        )}
      >
        <XIcon className="mx-auto size-4" />
      </button>
      <button
        type="button"
        aria-label="Download image"
        onClick={(e) => {
          e.stopPropagation();
          download();
        }}
        className={cn(
          floating,
          "absolute top-4 right-16 size-9 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#ffb400]/60",
        )}
      >
        <DownloadIcon className="mx-auto size-4" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}
