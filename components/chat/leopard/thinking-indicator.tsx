"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { mono, ShimmerLabel } from "./surfaces";

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
      className={cn(
        "text-foreground/55 flex items-center gap-2.5 text-sm",
        className,
      )}

      {...props}
    >
      {/* No blinking dot — the shimmer IS the live signal (operator 2026-09-01). */}
      <ShimmerLabel
        key={label}
        className="fade-in slide-in-from-bottom-1 animate-in relative inline-block font-sans text-[13px] font-medium leading-none tracking-[-0.01em] duration-300"
      >
        {label}
      </ShimmerLabel>
      {elapsed !== undefined && (
        <span className={cn(mono, "text-foreground/30 tabular-nums")}>
          {elapsed}
        </span>
      )}
    </div>
  );
}
