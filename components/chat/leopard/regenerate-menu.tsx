"use client";

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
  return (
    <div
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
          className={cn(
            floating,
            "fade-in zoom-in-95 slide-in-from-top-1 animate-in absolute left-0 top-full z-20 mt-1 flex w-60 flex-col gap-0.5 rounded-2xl p-1.5 duration-200",
          )}
        >
          <button
            type="button"
            onClick={() => {
              onOpenChange?.(false);
              onRetry?.();
            }}
            className="flex items-baseline gap-2 rounded-xl px-2.5 py-1.5 text-start transition-colors hover:dark:bg-white/[0.05] hover:light:bg-black/[0.04]"
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
              onClick={() => onPick?.(option.id)}
              className="flex items-baseline gap-2 rounded-xl px-2.5 py-1.5 text-start transition-colors hover:dark:bg-white/[0.05] hover:light:bg-black/[0.04]"
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
