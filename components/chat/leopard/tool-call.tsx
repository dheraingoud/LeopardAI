"use client";

import { CheckIcon, ChevronRightIcon, XIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  collapsePanel,
  field,
  mono,
  ShimmerLabel,
  SwapLabel,
} from "./surfaces";
import { JSONTree } from "./json-tree";

export interface ToolCallProps {
  label: string;
  activeLabel: string;
  query: string;
  request: string;
  result: string;
  running: boolean;
  /** Settled duration, e.g. "1.8s" — mono chip beside the done check. */
  elapsed?: string;
  /** True = the tool round failed (red ✕ instead of emerald ✓). */
  failed?: boolean;
  /** Structured request payload — renders as an expandable JSON tree when
   *  present, falling back to the `request` string otherwise. */
  requestData?: unknown;
  /** Structured result payload — same treatment as requestData. */
  resultData?: unknown;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

export function ToolCall({
  label,
  activeLabel,
  query,
  request,
  result,
  running,
  elapsed,
  failed = false,
  requestData,
  resultData,
  open,
  onOpenChange,
  className,
}: ToolCallProps) {
  return (
    <Collapsible
      data-slot="tool-call"
      open={open}
      onOpenChange={onOpenChange}
      className={cn("w-full max-w-sm", className)}
    >
      <CollapsibleTrigger className="group/trigger text-foreground/55 hover:text-foreground/90 flex items-center gap-2 rounded-md py-1 text-[13.5px] transition-colors outline-none">
        <ChevronRightIcon className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-open/trigger:rotate-90 group-data-panel-open/trigger:rotate-90 motion-reduce:transition-none" />
        <SwapLabel active={running ? 0 : 1} className="text-start">
          <ShimmerLabel
            active={running}
            className="relative inline-block leading-none"
          >
            {activeLabel}
          </ShimmerLabel>
          <>{label}</>
        </SwapLabel>
        {query ? (
          <span
            className={cn(
              mono,
              "bg-foreground/[0.06] text-foreground/70 max-w-[28ch] truncate rounded-md px-1.5 py-0.5",
            )}
          >
            {query}
          </span>
        ) : null}
        {elapsed !== undefined && !running && (
          <span className={cn(mono, "text-foreground/30 tabular-nums")}>
            {elapsed}
          </span>
        )}
        <span className="ms-auto flex w-4 items-center justify-end">
          {!running &&
            (failed ? (
              <XIcon className="fade-in zoom-in-90 animate-in size-3.5 text-red-500 duration-200" />
            ) : (
              <CheckIcon className="fade-in zoom-in-90 animate-in size-3.5 text-emerald-500 duration-200" />
            ))}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(collapsePanel, "outline-none")}>
        <div className={cn(field, "mt-2 overflow-hidden rounded-2xl text-xs")}>
          <div className="px-3.5 pt-2.5 pb-2">
            <p className={cn(mono, "text-foreground/35 mb-1")}>Request</p>
            {requestData !== undefined ? (
              <JSONTree value={requestData} compact />
            ) : (
              <p className="text-foreground/55 font-mono break-words">{request}</p>
            )}
          </div>
          <div className="bg-foreground/[0.06] mx-3.5 h-px" />
          <div className="px-3.5 pt-2 pb-2.5">
            <p className={cn(mono, "text-foreground/35 mb-1")}>Result</p>
            {resultData !== undefined ? (
              <JSONTree value={resultData} compact />
            ) : (
              <p className="text-foreground/90 break-words">{result}</p>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
