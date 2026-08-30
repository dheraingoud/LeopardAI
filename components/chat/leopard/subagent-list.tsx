"use client";

import type { ComponentProps } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";
import { pct } from "./range";

export interface SubagentItem {
  name: string;
  model: string;
}

export function SubagentList({
  agents,
  completedCount,
  progress,
  showSummary,
  summaryAgent,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "agents" | "completedCount" | "progress" | "showSummary" | "summaryAgent"
> & {
  agents: readonly SubagentItem[];
  completedCount: number;
  progress: readonly number[];
  showSummary: boolean;
  summaryAgent: SubagentItem;
}) {
  return (
    <div
      data-slot="subagent-list"
      className={cn("flex min-h-[14.5rem] w-full max-w-xs flex-col gap-2", className)}
      {...props}
    >
      {agents.map((agent, index) => (
        <SubagentRow
          key={agent.name}
          agent={agent}
          done={index < completedCount}
          width={progress[index] ?? 0}
        />
      ))}
      {showSummary && (
        <div className="fade-in slide-in-from-bottom-2 animate-in duration-300">
          <SubagentRow agent={summaryAgent} done={false} width={42} />
        </div>
      )}
    </div>
  );
}

function SubagentRow({
  agent,
  done,
  width,
}: {
  agent: SubagentItem;
  done: boolean;
  width: number;
}) {
  return (
    <div className={cn(paper, "flex flex-col gap-2 rounded-lg px-3.5 py-2.5")}>
      <div className="flex items-center gap-2">
        {done ? (
          <CheckIcon className="fade-in zoom-in-90 animate-in size-3.5 shrink-0 duration-200 dark:text-[#ffb400] light:text-[#d49600]" />
        ) : (
          <Loader2Icon className="text-foreground/35 size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
        )}
        <span className="flex-1 truncate text-[13.5px]">{agent.name}</span>
        <span className={cn(mono, "text-foreground/35")}>{agent.model}</span>
      </div>
      <span className="bg-foreground/[0.06] h-[3px] w-full overflow-hidden rounded-full">
        <span
          className={cn(
            "block h-full rounded-full transition-[width] duration-700",
            done ? "dark:bg-[#ffb400]/70 light:bg-[#d49600]/70" : "bg-foreground/60",
          )}
          style={{ width: `${pct(width, 100)}%` }}
        />
      </span>
    </div>
  );
}
