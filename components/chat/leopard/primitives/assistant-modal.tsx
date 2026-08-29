"use client";

import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { ChevronDownIcon, CircleHelpIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { floating, iconSwap, iconSwapIn, iconSwapOut, inkButton, mono } from "../surfaces";

// Presentational assistant modal: floating launcher button + popover panel.
// Content is a prop — leopard mounts it with static help text from the chat
// layout (no runtime thread behind it).

export type AssistantModalProps = Omit<ComponentProps<"div">, "children"> & {
  children: ReactNode;
  title?: string;
};

export function AssistantModal({
  children,
  title = "Help",
  className,
  ...props
}: AssistantModalProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      data-slot="assistant-modal"
      className={cn("fixed end-4 bottom-4 z-40 flex flex-col items-end gap-3", className)}
      {...props}
    >
      {open && (
        <div
          role="dialog"
          aria-label={title}
          className={cn(
            floating,
            "fade-in zoom-in-95 slide-in-from-bottom-2 animate-in flex h-125 w-100 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl duration-200 motion-reduce:animate-none",
          )}
        >
          <div className="flex items-center justify-between border-b px-5 py-3 dark:border-white/[0.06] light:border-black/[0.06]">
            <span className="text-[13.5px] font-medium">{title}</span>
            <span className={cn(mono, "text-foreground/30")}>esc to close</span>
          </div>
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
        </div>
      )}

      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close help" : "Open help"}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          inkButton,
          "size-11 rounded-full transition-transform duration-150 ease-out hover:scale-105 active:scale-96 motion-reduce:transition-none",
        )}
      >
        <span className="grid">
          <CircleHelpIcon className={cn("size-5", iconSwap, open ? iconSwapOut : iconSwapIn)} />
          <ChevronDownIcon className={cn("size-5", iconSwap, open ? iconSwapIn : iconSwapOut)} />
        </span>
      </button>
    </div>
  );
}
