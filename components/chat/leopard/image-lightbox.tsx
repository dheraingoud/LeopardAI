"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { DownloadIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ghostButton, floating } from "./surfaces";

// Image lightbox: attachment + generated
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
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Focus the close button on open (aria-modal claims a trap — at minimum
    // focus must land inside) and lock the document scroll while open.
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
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
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Image preview"}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        ref={closeRef}
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
      <motion.img
        src={src}
        alt={alt}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="max-h-[90vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </motion.div>,
    document.body,
  );
}
