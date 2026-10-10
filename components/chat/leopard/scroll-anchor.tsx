"use client";

import type { ComponentProps } from "react";
import { ArrowDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { floating } from "./surfaces";

// Leopard fork of the kit scroll-anchor affordance: the "N new messages" jump
// pill the transcript shows when the user scrolled up while new content
// arrived. messages.tsx owns the scroll math; this is the pill.
export function ScrollAnchorPill({
  count,
  onJump,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children" | "onJump" | "count"> & {
  count: number;
  onJump: () => void;
}) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      data-slot="scroll-anchor"
      onClick={onJump}
      // a11y (audit 2026-10-10): pill was unlabeled (only icon + count text).
      aria-label={`Jump to ${count} new ${count === 1 ? "message" : "messages"}`}
      className={cn(
        floating,
        "fade-in slide-in-from-bottom-2 animate-in mx-auto flex w-fit items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition-transform duration-200 hover:-translate-y-px outline-none focus-visible:ring-1 focus-visible:ring-[#ffb400]/40",
        className,
      )}
      {...props}
    >
      <ArrowDownIcon className="size-3 opacity-60" />
      {count} new {count === 1 ? "message" : "messages"}
    </button>
  );
}
