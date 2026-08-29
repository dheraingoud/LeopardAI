"use client";

import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CopyIcon,
  DownloadIcon,
  ImageIcon,
  ImageOffIcon,
  Loader2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Presentational image part: preview with load/error states, filename strip,
// click-to-zoom lightbox, download/copy actions. Props-based (no upstream runtime).
export type ImageStatus = "complete" | "loading" | "filtered";

const dataUriToBlob = (uri: string): Blob => {
  const comma = uri.indexOf(",");
  const meta = comma >= 0 ? uri.slice(0, comma) : uri;
  const data = comma >= 0 ? uri.slice(comma + 1) : "";
  const mime = meta.match(/data:([^;]+)/i)?.[1]?.toLowerCase() ?? "application/octet-stream";
  if (!/;base64/i.test(meta)) return new Blob([decodeURIComponent(data)], { type: mime });
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

function ImagePreview({ src, alt }: { src: string; alt: string }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setLoaded(true);
  }, [src]);

  return (
    <div className="relative min-h-32">
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center dark:bg-white/[0.04] light:bg-black/[0.035]">
          <ImageIcon className="size-8 animate-pulse dark:text-[#737373] light:text-[#8a8a8a]" />
        </div>
      )}
      {error ? (
        <div className="flex min-h-32 items-center justify-center p-4 dark:bg-white/[0.04] light:bg-black/[0.035]">
          <ImageOffIcon className="size-8 dark:text-[#737373] light:text-[#8a8a8a]" />
        </div>
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className={cn("block h-auto w-full object-contain", !loaded && "invisible")}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}

function ImageZoom({ src, alt, children }: { src: string; alt: string; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="Click to zoom image"
        className="cursor-zoom-in"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
      >
        {children}
      </div>
      {mounted &&
        open &&
        createPortal(
          <div
            role="button"
            tabIndex={0}
            aria-label="Close zoomed image"
            className="fade-in animate-in fixed inset-0 z-50 flex items-center justify-center bg-black/80 duration-200"
            onClick={() => setOpen(false)}
            onKeyDown={(e) => e.key === "Enter" && setOpen(false)}
          >
            <img
              src={src}
              alt={alt}
              className="fade-in zoom-in-95 animate-in max-h-[90vh] max-w-[90vw] cursor-zoom-out object-contain duration-200"
            />
          </div>,
          document.body,
        )}
    </>
  );
}

export const ImageBlock = memo(function ImageBlock({
  src,
  filename,
  status = "complete",
  className,
}: {
  src: string;
  filename?: string;
  status?: ImageStatus;
  className?: string;
}) {
  const alt = filename || "Image content";

  const download = () => {
    if (typeof document === "undefined") return;
    const isData = /^data:/i.test(src);
    const href = isData ? URL.createObjectURL(dataUriToBlob(src)) : src;
    const a = document.createElement("a");
    a.href = href;
    a.download = filename ?? "image.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (isData) setTimeout(() => URL.revokeObjectURL(href), 40_000);
  };

  const copy = () => {
    if (typeof navigator === "undefined" || typeof ClipboardItem === "undefined") return;
    const blobPromise = /^data:/i.test(src)
      ? Promise.resolve(dataUriToBlob(src))
      : fetch(src).then((r) => r.blob());
    void blobPromise.then((blob) =>
      navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]),
    ).catch(() => {});
  };

  return (
    <div
      data-slot="image-root"
      className={cn(
        "relative max-w-96 overflow-hidden rounded-lg border dark:border-white/[0.08] light:border-black/[0.08]",
        className,
      )}
    >
      {status === "loading" ? (
        <div className="flex min-h-32 items-center justify-center p-4 dark:bg-white/[0.04] light:bg-black/[0.035]">
          <Loader2Icon className="size-8 animate-spin dark:text-[#737373] light:text-[#8a8a8a]" />
          <span className="sr-only">Generating image</span>
        </div>
      ) : status === "filtered" ? (
        <div className="flex min-h-32 items-center justify-center p-4 text-sm dark:bg-white/[0.04] dark:text-[#a3a3a3] light:bg-black/[0.035] light:text-[#525252]">
          Image could not be generated
        </div>
      ) : (
        <ImageZoom src={src} alt={alt}>
          <ImagePreview src={src} alt={alt} />
        </ImageZoom>
      )}
      <div className="flex items-center justify-between gap-1 p-1">
        {filename ? (
          <span className="truncate px-2 py-1 text-xs dark:text-[#737373] light:text-[#8a8a8a]">
            {filename}
          </span>
        ) : (
          <span />
        )}
        {status === "complete" && (
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Download image" onClick={download} className="inline-flex size-7 items-center justify-center rounded hover:dark:bg-white/[0.06] hover:light:bg-black/[0.05] dark:text-[#a3a3a3] light:text-[#525252]">
              <DownloadIcon className="size-4" />
            </button>
            <button type="button" aria-label="Copy image" onClick={copy} className="inline-flex size-7 items-center justify-center rounded hover:dark:bg-white/[0.06] hover:light:bg-black/[0.05] dark:text-[#a3a3a3] light:text-[#525252]">
              <CopyIcon className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
