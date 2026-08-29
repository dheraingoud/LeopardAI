"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { mono } from "./surfaces";

// Centered hairline + mono label row. messages.tsx inserts one between
// messages when the calendar day changes (first-seen client timestamp).
export function DaySeparator({
  label,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & { label: string }) {
  return (
    <div
      data-slot="day-separator"
      className={cn("flex items-center gap-2.5 py-1", className)}
      {...props}
    >
      <span className="h-px flex-1 dark:bg-white/[0.07] light:bg-black/[0.07]" />
      <span className={cn(mono, "dark:text-[#737373] light:text-[#8a8a8a]")}>
        {label}
      </span>
      <span className="h-px flex-1 dark:bg-white/[0.07] light:bg-black/[0.07]" />
    </div>
  );
}
