"use client";

import { useCallback, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Presentational two-pane assistant layout: main content left, assistant
// thread right, with a draggable divider. Upstream uses a resizable-panel
// lib; here the drag is a 20-line pointer handler.

export type AssistantSidebarProps = Omit<ComponentProps<"div">, "children"> & {
  children: ReactNode;
  thread: ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
};

export function AssistantSidebar({
  children,
  thread,
  defaultWidth = 380,
  minWidth = 280,
  maxWidth = 640,
  className,
  ...props
}: AssistantSidebarProps) {
  const [width, setWidth] = useState(defaultWidth);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { startX: e.clientX, startWidth: width };
    },
    [width],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      setWidth(
        Math.min(maxWidth, Math.max(minWidth, d.startWidth + (d.startX - e.clientX))),
      );
    },
    [minWidth, maxWidth],
  );

  return (
    <div
      data-slot="assistant-sidebar"
      className={cn("flex h-full w-full overflow-hidden", className)}
      {...props}
    >
      <div data-slot="assistant-sidebar-main" className="min-w-0 flex-1">
        {children}
      </div>
      <div
        data-slot="assistant-sidebar-handle"
        role="separator"
        aria-orientation="vertical"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-[#ffb400]/30 active:bg-[#ffb400]/50"
      />
      <div
        data-slot="assistant-sidebar-thread"
        className="shrink-0 border-l dark:border-white/[0.06] light:border-black/[0.06]"
        style={{ width }}
      >
        {thread}
      </div>
    </div>
  );
}
