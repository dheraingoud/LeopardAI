"use client";

/**
 * ConfirmDialog — modal gate for destructive actions (delete chat, wipe all,
 * revoke key…). The action fires ONLY from the confirm button; backdrop click
 * and Esc both cancel. DESIGN.md: ink/amber palette, radius-md card, stacked
 * elevation, mono technical labels, sans body, weight ceiling 600.
 */
import { useEffect, useRef, useState } from "react";
import { TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Body copy — spell out exactly what is destroyed and that it is permanent. */
  description: string;
  /** Confirm button label, e.g. "Delete chat". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Called once, only when the user explicitly confirms. May be async. */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    // Initial focus lands on confirm so Enter works immediately, but nothing
    // fires without an explicit activation.
    confirmRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* backdrop — click cancels */}
      <button
        aria-label={cancelLabel}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div
        className={cn(
          "relative w-full max-w-[400px] rounded-xl p-5 elev-5 animate-scale-in",
          "dark:bg-[#14110d] dark:text-[#f5f5f5] dark:border dark:border-white/[0.1]",
          "light:bg-[#f7f1e3] light:text-[#171717] light:border light:border-black/[0.1]",
        )}
      >
        <button
          onClick={onCancel}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1 dark:text-[#737373] light:text-[#737373] hover:dark:text-white hover:light:text-[#171717] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg dark:bg-[#ef4444]/[0.12] light:bg-[#ef4444]/[0.1]">
            <TriangleAlert className="h-4 w-4 text-[#ef4444]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-5">{title}</h2>
            <p className="mt-1 text-[13px] leading-5 dark:text-[#a3a3a3] light:text-[#525252]">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className={cn(
              "h-8 rounded-lg px-3.5 text-[12px] font-medium transition-colors",
              "dark:bg-white/[0.06] dark:text-[#e5e5e5] hover:dark:bg-white/[0.1]",
              "light:bg-black/[0.05] light:text-[#262626] hover:light:bg-black/[0.08]",
            )}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={run}
            disabled={busy}
            className={cn(
              "h-8 rounded-lg px-3.5 text-[12px] font-semibold transition-colors",
              "bg-[#ef4444] text-white hover:bg-[#dc2626]",
              "disabled:opacity-50 disabled:pointer-events-none",
            )}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
