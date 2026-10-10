"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { mono } from "./surfaces";

export function ThinkingIndicator({
  label,
  elapsed,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "label" | "elapsed"> & {
  label: string;
  elapsed?: string;
}) {
  return (
    <div
      data-slot="thinking-indicator"
      // a11y (audit 2026-10-10): "Working" is a status, not a static label —
      // announce it to ATs without stealing focus.
      role="status"
      aria-live="polite"
      className={cn(
        "text-foreground/55 flex items-center gap-2.5 text-sm",
        className,
      )}

      {...props}
    >
      {/* Glimmer sweep IS the live signal (operator 2026-10-09: "Working"
          gets the conic amber sweep instead of the shimmer/dots). */}
      <span
        key={label}
        data-text={label}
        className="text-glimmer fade-in slide-in-from-bottom-1 animate-in relative inline-block font-sans text-[13px] font-medium leading-none tracking-[-0.01em] duration-300"
      >
        {label}
      </span>
      {elapsed !== undefined && (
        <span className={cn(mono, "text-foreground/30 tabular-nums")}>
          {elapsed}
        </span>
      )}
    </div>
  );
}
