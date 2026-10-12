"use client";

import { Loader2Icon, PlayIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { codeScroll, codeSurface, ghostButton, mono } from "./surfaces";
import type { RunCodeState } from "@/hooks/use-run-code";

// Run button + output pane for a runnable code block (js/ts). The executor is
// useRunCode (sandboxed iframe); this is the chrome.
export function CodeRunOutput({
  state,
  onDismiss,
}: {
  state: RunCodeState;
  onDismiss: () => void;
}) {
  if (!state.running && state.lines.length === 0 && !state.error) return null;
  return (
    <div
      data-slot="code-run-output"
      role="status"
      aria-live="polite"
      className="fade-in animate-in flex flex-col border-t border-foreground/[0.06] dark:bg-[#0a0a0c] light:bg-[#f0f0f0] px-3.5 py-2.5 duration-300"
    >
      <span className={cn(mono, "flex items-center justify-between pb-1.5 dark:text-[#555] light:text-[#999]")}>
        <span className="flex items-center gap-1.5">
          <span className={cn(
            "inline-block size-1.5 rounded-full",
            state.error ? "bg-red-500" : state.running ? "bg-amber-500 animate-pulse" : "bg-emerald-500",
          )} />
          output{state.durationMs !== null ? ` · ${state.durationMs}ms` : ""}
        </span>
        {!state.running && (
          <button
            type="button"
            aria-label="Dismiss output"
            onClick={onDismiss}
            className={cn(ghostButton, "size-5")}
          >
            <XIcon className="size-3" />
          </button>
        )}
      </span>
      <div className={codeScroll}>
        <div className={cn(codeSurface, "flex flex-col")}>
          {state.lines.map((line, i) => (
            <span
              key={`${i}-${line}`}
              className="fade-in animate-in fill-mode-both font-mono text-xs leading-relaxed whitespace-pre dark:text-[#a8d8a8] light:text-[#1a6e1a]"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {line}
            </span>
          ))}
          {state.error && (
            <span className="font-mono text-xs leading-relaxed dark:text-red-400 light:text-red-600">
              {state.error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function RunButton({
  running,
  onRun,
}: {
  running: boolean;
  onRun: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={running ? "Running" : "Run this snippet"}
      title={running ? "Running" : "Run"}
      onClick={onRun}
      disabled={running}
      className="cb-btn cb-btn-run shrink-0 disabled:pointer-events-none"
    >
      {running ? (
        <Loader2Icon className="size-3 animate-spin motion-reduce:animate-none" />
      ) : (
        <PlayIcon className="size-3 translate-x-px" />
      )}
      <span className="text-[10px] font-medium">{running ? "Running" : "Run"}</span>
    </button>
  );
}
