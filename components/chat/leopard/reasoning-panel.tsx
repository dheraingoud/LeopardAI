"use client";

import { cn } from "@/lib/utils";
import { mono, ShimmerLabel, SwapLabel } from "./surfaces";

// Leopard reasoning panel — STATUS ROW ONLY. User directive
// 2026-08-29: raw chain-of-thought ("let me use duckduckgo…") must NEVER be
// shown to the user in any context, so the panel renders no expandable body:
// a shimmer "Thinking" row while streaming, "Thought for Ns" + effort chip
// when done. The `content` prop is accepted for call-site compatibility and
// deliberately never rendered.

export interface LeopardReasoningPanelProps {
  /** Never rendered (chain-of-thought is internal-only). */
  content: string;
  /** Live reasoning tail — shimmers. */
  streaming: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  elapsedMs?: number;
  /** e.g. "HIGH" — resting mono chip, only when not streaming. */
  effortBadge?: string;
  className?: string;
}

export function ReasoningPanel({
  streaming,
  elapsedMs,
  effortBadge,
  className,
}: LeopardReasoningPanelProps) {
  const seconds =
    elapsedMs !== undefined ? Math.max(1, Math.round(elapsedMs / 1000)) : null;
  const resting =
    seconds !== null ? `Thought for ${seconds}s` : "Thought process";

  return (
    <div
      data-slot="reasoning-panel"
      className={cn(
        "my-3 flex w-full max-w-sm items-center gap-1.5 py-1 text-[13.5px] text-foreground/55",
        className,
      )}
    >
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
    </div>
  );
}
