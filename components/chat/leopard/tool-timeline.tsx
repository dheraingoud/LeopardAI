"use client";

import { Loader2Icon, CheckIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { mono } from "./surfaces";

export interface TimelineTool {
  id: string;
  name: string;
  state: "running" | "done" | "failed";
  durationMs?: number;
}

// Compact per-tool ledger rendered above the expanded ToolGroup cards.
// Duration is omitted when the caller cannot time the call.
export function ToolTimeline({
  tools,
  className,
}: {
  tools: readonly TimelineTool[];
  className?: string;
}) {
  return (
    <div
      data-slot="tool-timeline"
      className={cn("flex flex-col gap-1", className)}
    >
      {tools.map((tool) => (
        <div key={tool.id} className="flex items-center gap-2 px-1.5 py-0.5">
          <span className="flex size-3.5 shrink-0 items-center justify-center">
            {tool.state === "running" ? (
              <Loader2Icon className="size-3 animate-spin text-[#ffb400] light:text-[#d49600] motion-reduce:animate-none" />
            ) : tool.state === "failed" ? (
              <XIcon className="size-3 text-red-500" />
            ) : (
              <CheckIcon className="size-3 text-emerald-500" />
            )}
          </span>
          <span className={cn(mono, "text-foreground/55 min-w-0 flex-1 truncate")}>
            {tool.name}
          </span>
          {tool.durationMs !== undefined && (
            <span className={cn(mono, "text-foreground/25 shrink-0 tabular-nums")}>
              {tool.durationMs}ms
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
