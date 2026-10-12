"use client";

import { useEffect, useRef } from "react";
import { RefreshCwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { floating, ghostButton, mono } from "./surfaces";

export interface RegenerateOption {
  id: string;
  label: string;
  detail: string;
}

// The assistant Regenerate affordance as a dropdown: "Retry" re-runs the same
// model; below the hairline, "Retry with…" lists every registry text model.
// Picking the current id === Retry.
export function RegenerateMenu({
  options,
  open,
  currentId,
  onOpenChange,
  onRetry,
  onPick,
  className,
}: {
  options: readonly RegenerateOption[];
  open: boolean;
  currentId: string;
  onOpenChange?: (open: boolean) => void;
  onRetry?: () => void;
  onPick?: (id: string) => void;
  className?: string;
}) {
  // Outside click closes the menu — without it the dropdown only closed on
  // Escape/re-click/pick (2026-10-12 audit).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        onOpenChange?.(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onOpenChange]);

  return (
    <div
      ref={rootRef}
      data-slot="regenerate-menu"
      className={cn("relative flex flex-col gap-2", className)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label="Regenerate response"
        title="Regenerate"
        onClick={() => onOpenChange?.(!open)}
        className={cn(
          ghostButton,
          "size-7",
          open && "dark:bg-white/[0.06] light:bg-black/[0.05] dark:text-white light:text-black",
        )}
      >
        <RefreshCwIcon className="size-3.5" />
      </button>

      {open && (
        <div
          // a11y (audit 2026-10-10): the menu was a bare div — no menu role,
          // no item roles, no Escape-to-close. WAI-ARIA menu pattern.
          role="menu"
          aria-label="Regenerate options"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onOpenChange?.(false);
            }
          }}
          className={cn(
            floating,
            "fade-in zoom-in-95 slide-in-from-top-1 animate-in absolute left-0 top-full z-20 mt-1 flex w-60 flex-col gap-0.5 rounded-2xl p-1.5 duration-200",
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenChange?.(false);
              onRetry?.();
            }}
            className="flex items-baseline gap-2 rounded-xl px-2.5 py-1.5 text-start transition-colors hover:dark:bg-white/[0.05] hover:light:bg-black/[0.04] outline-none focus-visible:ring-1 focus-visible:ring-[#ffb400]/40"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] dark:text-[#e5e5e5] light:text-[#262626]">
              Retry
            </span>
            <span className={cn(mono, "shrink-0 dark:text-[#ffb400] light:text-[#d49600]")}>
              same model
            </span>
          </button>
          <div className="mx-2 my-1 h-px dark:bg-white/[0.07] light:bg-black/[0.07]" />
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              onClick={() => onPick?.(option.id)}
              className="flex items-baseline gap-2 rounded-xl px-2.5 py-1.5 text-start transition-colors hover:dark:bg-white/[0.05] hover:light:bg-black/[0.04] outline-none focus-visible:ring-1 focus-visible:ring-[#ffb400]/40"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] dark:text-[#cfcfcf] light:text-[#404040]">
                {option.label}
              </span>
              <span
                className={cn(
                  mono,
                  "shrink-0",
                  option.id === currentId
                    ? "dark:text-[#ffb400] light:text-[#d49600]"
                    : "dark:text-[#505050] light:text-[#8a8a8a]",
                )}
              >
                {option.id === currentId ? "current" : option.detail}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
