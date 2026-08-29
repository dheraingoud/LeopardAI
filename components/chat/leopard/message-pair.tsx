"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Layout-only wrapper for one user→assistant turn. messages.tsx groups
// consecutive messages into pairs so each exchange reads as one block.
export function MessagePair({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="message-pair"
      className={cn("flex flex-col", className)}
      {...props}
    />
  );
}
