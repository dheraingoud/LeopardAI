"use client";

import { useRef } from "react";
import { ChevronDownIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { collapsePanel, mono, ShimmerLabel, SwapLabel } from "./surfaces";

// Leopard reasoning panel: clickable trigger (kit behavior); expands to the
// model's thinking rendered as markdown. Auto-open while streaming, resting
// "Thought for Ns" + effort chip when done.
export interface LeopardReasoningPanelProps {
  content: string;
  streaming: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  elapsedMs?: number;
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

  // Height animation runs inside the transcript scroller — dispatch per-frame
  // deltas so messages.tsx can hold the reading anchor.
  const contentRef = useRef<HTMLDivElement>(null);
  const handleOpenChange = (next: boolean) => {
    const el = contentRef.current;
    if (el && typeof window !== "undefined") {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = reduced ? 0 : 220;
      let prev = el.getBoundingClientRect().height;
      const start = performance.now();
      const step = () => {
        const cur = el.getBoundingClientRect().height;
        const delta = cur - prev;
        prev = cur;
        if (Math.abs(delta) > 0.5) {
          window.dispatchEvent(
            new CustomEvent("leopard:reasoning-resize", { detail: { delta } }),
          );
        }
        if (performance.now() - start < duration) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    onOpenChange(next);
  };

  return (
    <Collapsible
      data-slot="reasoning-panel"
      open={open}
      onOpenChange={handleOpenChange}
      className={cn("my-3 w-full max-w-sm", className)}
    >
      <CollapsibleTrigger className="group/trigger flex items-center gap-1.5 py-1 font-sans text-[13px] font-medium tracking-[-0.01em] text-foreground/60 transition-[color,scale] outline-none hover:text-foreground/90 active:scale-[0.98]">
        {/* No blinking dot — the shimmer IS the live signal (operator 2026-09-01). */}
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
      {/* Operator 2026-08-31: show the reasoning — prior "CoT hidden" product
          rule retired. Plain text, pre-wrap, scroll-capped. */}
      <CollapsibleContent
        ref={contentRef}
        className={cn(collapsePanel, "outline-none")}
      >
        <div className="max-h-64 overflow-y-auto pt-2 pb-1">
          {/* CoT body is prose, not code — Geist per DESIGN.md (mono is for
              technical labels only). */}
          <p className="whitespace-pre-wrap font-sans text-[13px] leading-[1.65] text-foreground/60">
            {content || (streaming ? "Thinking…" : "No reasoning captured.")}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
