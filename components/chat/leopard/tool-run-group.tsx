"use client";

import type { ComponentProps } from "react";
import { CheckIcon, ChevronRightIcon, Loader2Icon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";

/**
 * ToolRunGroup — collapsible card for a burst of same-turn tool calls
 * Collapsible card for a burst of same-turn tool calls;
 * Leopard surfaces, no upstream coupling). A long tool streak (3 fetches in a
 * row) used to render as a wall of separate ToolCards; grouped they read as
 * one collapsible run with a live done/total counter.
 */
export type ToolRunItemState = "running" | "done" | "failed";

export interface ToolRunItem {
  id: string;
  name: string;
  target: string;
  state: ToolRunItemState;
  durationMs?: number;
}

export function ToolRunGroup({
  label,
  tools,
  open,
  onOpenChange,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "label" | "tools" | "open" | "onOpenChange"
> & {
  label: string;
  tools: readonly ToolRunItem[];
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const running = tools.filter((tool) => tool.state === "running").length;
  const failed = tools.filter((tool) => tool.state === "failed").length;
  const headerClassName = cn(
    "flex items-center gap-2.5 px-3.5 py-2.5 text-start",
    onOpenChange && "hover:bg-foreground/[0.03] transition-colors",
  );
  const header = (
    <>
      <ChevronRightIcon
        className={cn(
          "text-foreground/25 size-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
          open && "rotate-90",
        )}
      />
      <span className="min-w-0 flex-1 truncate text-[13.5px]">{label}</span>
      <span className={cn(mono, "text-foreground/30 shrink-0 tabular-nums")}>
        {running > 0
          ? `${tools.length - running}/${tools.length}`
          : failed > 0
            ? `${failed} failed`
            : `${tools.length} done`}
      </span>
      {running > 0 ? (
        <Loader2Icon className="text-foreground/35 size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
      ) : failed > 0 ? (
        <XIcon className="size-3.5 shrink-0 text-red-500" />
      ) : (
        <CheckIcon className="size-3.5 shrink-0 text-emerald-500" />
      )}
    </>
  );

  return (
    <div
      data-slot="tool-run-group"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col overflow-hidden rounded-2xl",
        className,
      )}
      {...props}
    >
      {onOpenChange ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
          className={headerClassName}
        >
          {header}
        </button>
      ) : (
        <div className={headerClassName}>{header}</div>
      )}

      {open && (
        <div className="border-foreground/[0.06] fade-in slide-in-from-top-1 animate-in flex flex-col border-t duration-200">
          {tools.map((tool) => (
            <div
              key={tool.id}
              className="flex items-center gap-2.5 px-3.5 py-2"
            >
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                {tool.state === "running" ? (
                  <Loader2Icon className="text-foreground/35 size-3 animate-spin motion-reduce:animate-none" />
                ) : tool.state === "failed" ? (
                  <XIcon className="size-3 text-red-500" />
                ) : (
                  <CheckIcon className="size-3 text-emerald-500" />
                )}
              </span>
              <span className={cn(mono, "text-foreground/55 shrink-0")}>
                {tool.name}
              </span>
              <span className="text-foreground/80 min-w-0 flex-1 truncate text-[13px]">
                {tool.target}
              </span>
              {tool.durationMs !== undefined && (
                <span
                  className={cn(
                    mono,
                    "text-foreground/25 shrink-0 tabular-nums",
                  )}
                >
                  {tool.durationMs}ms
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
