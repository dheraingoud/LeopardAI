"use client";

import { memo, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Layout-only wrapper for one user→assistant turn. messages.tsx groups
// consecutive messages into pairs so each exchange reads as one block.
export const MessagePair = memo(function MessagePair({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="message-pair"
      // a11y (audit 2026-10-10): the action bar reveals on :focus-within —
      // keyboard users tabbing into the pair's buttons used to land on
      // invisible controls. Focusable pair gives focus-within a trigger.
      tabIndex={0}
      className={cn(
        "group flex flex-col outline-none focus-visible:ring-1 focus-visible:ring-[#ffb400]/25 rounded-lg",
        className,
      )}
      {...props}
    />
  );
});
