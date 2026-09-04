"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { collapsePanel, mono, ShimmerLabel, SwapLabel } from "./surfaces";

// Leopard reasoning panel: clickable trigger (kit behavior); expands to the
// model's thinking rendered as markdown. Auto-open while streaming with a
// live second counter; resting "Thought for N seconds" + effort chip on settle.
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
  // Resting label matches the frozen chip's precision (tenths under 10s) so
  // "0.5s" while streaming doesn't become "Thought for 1 seconds" at rest.
  const secs = elapsedMs !== undefined ? Math.max(0.1, elapsedMs / 1000) : null;
  const secsLabel =
    secs === null
      ? null
      : secs < 10
        ? secs.toFixed(1).replace(/\.0$/, "")
        : String(Math.round(secs));
  // Operator 2026-09-02: resting label is "thought for x seconds" — never
  // "thought process". Falls back to plain "Thought" if no clock survived.
  const resting =
    secsLabel !== null
      ? `Thought for ${secsLabel} second${secsLabel === "1" ? "" : "s"}`
      : "Thought";

  // Live ticking while the model is still thinking — counts up from 0s and
  // freezes (via the parent's elapsedMs) once the answer text begins.
  const startRef = useRef<number | null>(null);
  const [liveSeconds, setLiveSeconds] = useState(0);
  useEffect(() => {
    if (!streaming) {
      startRef.current = null;
      return;
    }
    if (startRef.current === null) startRef.current = performance.now();
    const start = startRef.current;
    const tick = () =>
      setLiveSeconds(Math.max(0, Math.round((performance.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [streaming]);

  // Height animation runs inside the transcript scroller — dispatch per-frame
  // deltas so messages.tsx can hold the reading anchor.
  const contentRef = useRef<HTMLDivElement>(null);
  // Follow the thinking while it streams: the inner scroller is capped at
  // max-h-64, so without this the tail of the reasoning freezes out of view
  // mid-stream (operator 2026-09-04). Pins only while streaming + open — once
  // it settles the user scrolls the static text freely.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!streaming || !open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [content, streaming, open]);
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
            <span className={cn(mono, "text-foreground/30 tabular-nums")}>
              {streaming
                ? `${liveSeconds}s`
                : elapsedMs !== undefined
                  ? `${Math.max(0.1, elapsedMs / 1000).toFixed(1)}s`
                  : null}
            </span>
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
        <div ref={scrollRef} className="max-h-64 overflow-y-auto pt-2 pb-1">
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
