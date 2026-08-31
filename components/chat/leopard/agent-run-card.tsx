"use client";

// Φ-multi-agent · inline orchestration card.
//
// Collapsed: amber bot icon + "Subagents" title + status line ("running ·
// 1/3") + stacked per-agent progress bars + model chip. Expanding reveals a
// FLAT list (no phase grouping): one row per agent — status dot, master-
// assigned role name, kind chip, live activity note, status on the right.
// Agents are temporary and invisible outside this card; the master's
// synthesis streams as normal text after it.

import { useState } from "react";
import { BotIcon, CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, mono, paper } from "./surfaces";
import { UTILITY_MODEL } from "@/lib/nim";

export interface AgentRunAgent {
  name: string;
  kind: "research" | "write" | "verify" | "general";
  task: string;
  status: "pending" | "running" | "done" | "error";
  /** One-line live activity note (e.g. "searching the web"). */
  note?: string;
}

export interface AgentRunState {
  agents: AgentRunAgent[];
  /** Stream-level settled state — the tool call finished (output available). */
  done: boolean;
}

function progressOf(a: AgentRunAgent): number {
  if (a.status === "done" || a.status === "error") return 100;
  if (a.status === "running") return 55;
  return 0;
}

function statusLabel(a: AgentRunAgent): string {
  if (a.status === "done") return "done";
  if (a.status === "error") return "failed";
  if (a.status === "running") return "running";
  return "queued";
}

const KIND_CHIP: Record<AgentRunAgent["kind"], string> = {
  research: "research",
  write: "write",
  verify: "verify",
  general: "task",
};

export function AgentRunCard({ run, className }: { run: AgentRunState; className?: string }) {
  const [expanded, setExpanded] = useState(false);

  const total = run.agents.length;
  const doneCount = run.agents.filter((a) => a.status === "done").length;
  const errCount = run.agents.filter((a) => a.status === "error").length;
  const running = !run.done;
  const statusLine = run.done
    ? `done · ${doneCount}/${total}${errCount ? ` · ${errCount} failed` : ""}`
    : `running · ${doneCount}/${total}`;

  return (
    <div
      data-slot="agent-run-card"
      className={cn(paper, "flex w-full max-w-md flex-col gap-3 rounded-lg p-4", className)}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center gap-2.5 text-start"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md dark:bg-[#ffb400]/[0.08] dark:text-[#ffb400] light:bg-[#d49600]/[0.08] light:text-[#d49600]">
          <BotIcon className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13.5px] font-medium">Subagents</span>
          <span className={cn(mono, "text-foreground/40 flex items-center gap-1.5")}>
            {running && (
              <span className="size-1.5 animate-pulse rounded-full dark:bg-[#ffb400] light:bg-[#d49600]" />
            )}
            {statusLine}
          </span>
        </span>
        <ChevronDownIcon
          className={cn(
            "text-foreground/35 size-4 shrink-0 transition-transform duration-300",
            expanded && "rotate-180",
          )}
        />
      </button>

      {/* Collapsed body: stacked per-agent progress bars. */}
      <div className="flex flex-col gap-1.5">
        {run.agents.map((a) => (
          <div
            key={a.name}
            className="bg-foreground/[0.06] h-[3px] w-full overflow-hidden rounded-full"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700",
                a.status === "error" ? "bg-red-400/70" : "dark:bg-[#ffb400] light:bg-[#d49600]",
              )}
              style={{ width: `${progressOf(a)}%` }}
            />
          </div>
        ))}
      </div>

      {/* Expanded body: flat agent list. */}
      {expanded && (
        <div className="border-foreground/[0.07] fade-in slide-in-from-top-1 animate-in flex flex-col gap-0.5 border-t pt-2 duration-300">
          {run.agents.map((a) => (
            <div key={a.name} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  a.status === "done" && "bg-emerald-400/80",
                  a.status === "error" && "bg-red-400/70",
                  a.status === "running" && "animate-pulse dark:bg-[#ffb400] light:bg-[#d49600]",
                  a.status === "pending" && "bg-foreground/15",
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-[13px] font-medium">{a.name}</span>
                  <span className={cn(mono, "text-foreground/30 shrink-0")}>{KIND_CHIP[a.kind]}</span>
                </span>
                <span className={cn(mono, "text-foreground/45 truncate")}>
                  {a.status === "running" ? (a.note ?? "working") : a.task}
                </span>
              </span>
              <span className={cn(mono, "flex shrink-0 items-center gap-1 text-[11px]")}>
                {a.status === "done" && <CheckIcon className="size-3 text-emerald-400/80" />}
                {a.status === "error" && <XIcon className="size-3 text-red-400/70" />}
                <span
                  className={cn(
                    a.status === "running"
                      ? "dark:text-[#ffb400] light:text-[#d49600]"
                      : "text-foreground/40",
                  )}
                >
                  {statusLabel(a)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className={cn(mono, field, "text-foreground/35 rounded-full px-2 py-0.5")}>
          subagents run on {UTILITY_MODEL.split("/").pop()}
        </span>
        {run.done && (
          <span className={cn(mono, "text-foreground/45 shrink-0")}>
            coverage {total ? Math.round((doneCount / total) * 100) : 0}%
          </span>
        )}
      </div>
    </div>
  );
}
