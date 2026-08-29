// Leopard fork of the elements kit mobile-composer: bottom-docked mobile
// shell. Presentational only — not wired anywhere yet.
"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function MobileComposer({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="mobile-composer"
      className={cn(
        "bg-background flex w-full flex-col gap-2.5 rounded-t-[20px] border-t px-3 pt-3 pb-6",
        "dark:border-white/[0.08] light:border-black/[0.08]",
        "dark:shadow-[0_-8px_24px_rgba(0,0,0,0.35)] light:shadow-[0_-8px_24px_rgba(0,0,0,0.08)]",
        className,
      )}
      {...props}
    >
      {children}
      <span
        aria-hidden
        className="bg-foreground/15 mx-auto h-1 w-28 rounded-full"
      />
    </div>
  );
}
