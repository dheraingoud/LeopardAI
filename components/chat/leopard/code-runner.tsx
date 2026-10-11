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
      className="border-foreground/[0.07] fade-in animate-in flex flex-col border-t px-3.5 py-2.5 duration-300"
    >
      <span className={cn(mono, "text-foreground/30 flex items-center justify-between pb-1")}>
        <span>
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
              className="fade-in animate-in fill-mode-both font-mono text-xs leading-relaxed whitespace-pre text-foreground/70"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {line}
            </span>
          ))}
          {state.error && (
            <span className="font-mono text-xs leading-relaxed text-red-600 dark:text-red-400">
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
      className={cn(ghostButton, "size-6 shrink-0 disabled:pointer-events-none")}
    >
      {running ? (
        <Loader2Icon className="size-3.5 animate-spin motion-reduce:animate-none" />
      ) : (
        <PlayIcon className="size-3.5 translate-x-px" />
      )}
    </button>
  );
}
