"use client";

import { createContext, useContext, useMemo, type FC, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Presentational port: token usage comes in as props (leopard has no upstream runtime
// thread hooks). Pass `usage` + `modelContextWindow`; render Ring/Bar/Text preset.

export type ContextUsage = {
  totalTokens?: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
};

const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${tokens}`;
};

const getUsagePercent = (total: number | undefined, window: number): number =>
  !total ? 0 : Math.min((total / window) * 100, 100);

type Severity = "normal" | "warning" | "critical";
const getSeverity = (percent: number): Severity =>
  percent > 85 ? "critical" : percent >= 65 ? "warning" : "normal";
const getStrokeColor = (p: number) =>
  getSeverity(p) === "critical" ? "stroke-red-500" : getSeverity(p) === "warning" ? "stroke-[#ffb400] dark:stroke-[#ffb400]" : "stroke-foreground";
const getBarColor = (p: number) =>
  getSeverity(p) === "critical" ? "bg-red-500" : getSeverity(p) === "warning" ? "bg-[#ffb400] dark:bg-[#ffb400]" : "bg-foreground";

type ContextValue = {
  usage: ContextUsage | undefined;
  totalTokens: number;
  percent: number;
  modelContextWindow: number;
};

const Ctx = createContext<ContextValue | null>(null);
function useCtx(): ContextValue {
  const c = useContext(Ctx);
  if (!c) throw new Error("ContextDisplay.* must be used within ContextDisplay.Root");
  return c;
}

type PresetProps = {
  modelContextWindow: number;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  usage?: ContextUsage | undefined;
};

function ContextDisplayRoot({
  modelContextWindow,
  children,
  usage,
}: {
  modelContextWindow: number;
  children: ReactNode;
  usage?: ContextUsage | undefined;
}) {
  const totalTokens = usage?.totalTokens ?? 0;
  const percent = getUsagePercent(totalTokens, modelContextWindow);
  const value = useMemo(
    () => ({ usage, totalTokens, percent, modelContextWindow }),
    [usage, totalTokens, percent, modelContextWindow],
  );
  return (
    <Ctx.Provider value={value}>
      <TooltipProvider>
        <Tooltip>{children}</Tooltip>
      </TooltipProvider>
    </Ctx.Provider>
  );
}

function ContextDisplayTrigger({ className, children, ...props }: React.ComponentProps<"button">) {
  return (
    <TooltipTrigger
      render={
        <button
          type="button"
          data-slot="context-display-trigger"
          className={cn("inline-flex items-center rounded-md transition-colors", className)}
          {...props}
        />
      }
    >
      {children}
    </TooltipTrigger>
  );
}

type Segment = { label: string; tokens: number };
const getSegments = (usage: ContextUsage | undefined): Segment[] => {
  if (!usage) return [];
  return [
    { label: "Input", tokens: usage.inputTokens ?? 0 },
    { label: "Cached input", tokens: usage.cachedInputTokens ?? 0 },
    { label: "Output", tokens: usage.outputTokens ?? 0 },
    { label: "Reasoning", tokens: usage.reasoningTokens ?? 0 },
  ].filter((s) => s.tokens > 0);
};

function ContextDisplayContent({ side = "top", className }: { side?: PresetProps["side"]; className?: string }) {
  const { usage, totalTokens, percent, modelContextWindow } = useCtx();
  const segments = getSegments(usage);
  return (
    <TooltipContent
      side={side}
      sideOffset={8}
      data-slot="context-display-popover"
      className={cn(
        "w-56 rounded-lg border p-3 text-left dark:border-white/10 light:border-black/10 dark:bg-[#141414] light:bg-white dark:text-[#e5e5e5] light:text-[#262626] [&_[data-slot=tooltip-arrow]]:hidden",
        className,
      )}
    >
      <div className="text-xs">
        <div className="flex items-baseline justify-between gap-6 whitespace-nowrap">
          <span className="font-medium">Context usage</span>
          <span className="tabular-nums text-foreground/50">
            {formatTokenCount(Math.min(totalTokens, modelContextWindow))} of {formatTokenCount(modelContextWindow)}
          </span>
        </div>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full dark:bg-white/[0.06] light:bg-black/[0.06]">
          <div
            className={cn("h-full w-(--usage-width) rounded-full transition-[width] duration-300", totalTokens > 0 && "min-w-1", getBarColor(percent))}
            style={{ "--usage-width": `${percent}%` } as React.CSSProperties}
          />
        </div>
        {segments.length > 0 && (
          <div className="mt-3 grid gap-1.5">
            {segments.map((s) => (
              <div key={s.label} className="flex items-baseline justify-between gap-6">
                <span className="text-foreground/50">{s.label}</span>
                <span className="tabular-nums">{formatTokenCount(s.tokens)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </TooltipContent>
  );
}

const RING_SIZE = 18;
const RING_STROKE = 2.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function RingVisual() {
  const { percent } = useCtx();
  return (
    <svg aria-hidden width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="-rotate-90">
      <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" strokeWidth={RING_STROKE} className="stroke-black/[0.1] dark:stroke-white/[0.12]" />
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE - (percent / 100) * RING_CIRCUMFERENCE}
        className={cn("transition-[stroke-dashoffset,stroke] duration-300", getStrokeColor(percent))}
      />
    </svg>
  );
}

function RingPercentLabel() {
  const { percent } = useCtx();
  return <span className="font-mono tabular-nums">{Math.round(percent)}%</span>;
}

const ContextDisplayRing: FC<PresetProps> = ({ modelContextWindow, className, side, usage }) => (
  <ContextDisplayRoot modelContextWindow={modelContextWindow} usage={usage}>
    <ContextDisplayTrigger className={cn("gap-1.5 px-1.5 py-1 text-xs text-foreground/50 hover:text-foreground", className)} aria-label="Context usage">
      <RingVisual />
      <RingPercentLabel />
    </ContextDisplayTrigger>
    <ContextDisplayContent side={side} />
  </ContextDisplayRoot>
);

function BarVisual() {
  const { percent, totalTokens } = useCtx();
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full dark:bg-white/[0.06] light:bg-black/[0.06]">
        <div className={cn("h-full rounded-full transition-all duration-300", getBarColor(percent))} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-foreground/50">
        {formatTokenCount(totalTokens)} ({Math.round(percent)}%)
      </span>
    </div>
  );
}

const ContextDisplayBar: FC<PresetProps> = ({ modelContextWindow, className, side, usage }) => (
  <ContextDisplayRoot modelContextWindow={modelContextWindow} usage={usage}>
    <ContextDisplayTrigger className={cn("px-2 py-1", className)} aria-label="Context usage">
      <BarVisual />
    </ContextDisplayTrigger>
    <ContextDisplayContent side={side} />
  </ContextDisplayRoot>
);

function TextVisual() {
  const { totalTokens, modelContextWindow } = useCtx();
  return (
    <>
      {formatTokenCount(totalTokens)} / {formatTokenCount(modelContextWindow)}
    </>
  );
}

const ContextDisplayText: FC<PresetProps> = ({ modelContextWindow, className, side, usage }) => (
  <ContextDisplayRoot modelContextWindow={modelContextWindow} usage={usage}>
    <ContextDisplayTrigger
      aria-label="Context usage"
      className={cn("px-2 py-1 font-mono text-xs tabular-nums text-foreground/50 hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]", className)}
    >
      <TextVisual />
    </ContextDisplayTrigger>
    <ContextDisplayContent side={side} />
  </ContextDisplayRoot>
);

export { ContextDisplayRoot, ContextDisplayTrigger, ContextDisplayContent, ContextDisplayRing, ContextDisplayBar, ContextDisplayText };
