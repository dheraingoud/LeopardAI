"use client";

import { ChevronDownIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { collapsePanel, mono, ShimmerLabel, SwapLabel } from "./surfaces";
import { StreamItDown } from "@/components/chat/streamitdown";

// Leopard fork of aui ReasoningPanel: steps[]→single markdown body rendered
// through StreamItDown (one prose pipeline), effort badge kept from the old
// ReasoningBlock, Brain icon keeps the "thought" identity, amber accents via
// the forked surfaces (ShimmerLabel) + inline amber dot.

export interface LeopardReasoningPanelProps {
  /** Normalized reasoning text (compactWhitespace applied by caller). */
  content: string;
  /** Live reasoning tail — shimmers + defaults open. */
  streaming: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  elapsedMs?: number;
  /** e.g. "HIGH" — resting mono chip, only when not streaming. */
  effortBadge?: string;
  className?: string;
}

export function ReasoningPanel({
  content,
  streaming,
  open,
  onOpenChange,
  elapsedMs,
  effortBadge,
  className,
}: LeopardReasoningPanelProps) {
  const seconds =
    elapsedMs !== undefined ? Math.max(1, Math.round(elapsedMs / 1000)) : null;
  const resting =
    seconds !== null ? `Thought for ${seconds}s` : "Thought process";

  return (
    <Collapsible
      data-slot="reasoning-panel"
      open={open}
      onOpenChange={onOpenChange}
      className={cn("my-3 w-full max-w-sm", className)}
    >
      <CollapsibleTrigger className="group/trigger flex items-center gap-1.5 py-1 text-[13.5px] text-foreground/55 transition-[color,scale] outline-none hover:text-foreground/90 active:scale-[0.98]">
        {streaming && (
          <span
            aria-hidden
            className="inline-block size-1.5 rounded-full dark:bg-[#ffb400] light:bg-[#d49600] animate-pulse"
          />
        )}
        <SwapLabel active={streaming ? 0 : 1} className="text-start">
          <>
            <ShimmerLabel
              active={streaming}
              className="relative inline-block leading-none"
            >
              Thinking
            </ShimmerLabel>
            {elapsedMs !== undefined && (
              <span className={cn(mono, "text-foreground/30 tabular-nums")}>
                {Math.max(0.1, elapsedMs / 1000).toFixed(1)}s
              </span>
            )}
          </>
          <>
            <span>{resting}</span>
            {effortBadge && (
              <span
                className={cn(
                  mono,
                  "rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-foreground/50 uppercase",
                )}
              >
                {effortBadge}
              </span>
            )}
          </>
        </SwapLabel>
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-open/trigger:rotate-180 group-data-panel-open/trigger:rotate-180 motion-reduce:transition-none" />
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(collapsePanel, "outline-none")}>
        <div className="max-h-[420px] overflow-y-auto pt-2 pb-1 text-[13.5px] leading-[1.7] text-foreground/70 [&_.markdown-body]:text-[13.5px]">
          <StreamItDown content={content} streaming={streaming} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
