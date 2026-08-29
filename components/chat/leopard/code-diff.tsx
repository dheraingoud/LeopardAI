"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { codeScroll, codeSurface, mono, paper } from "./surfaces";

// Unified-diff surface for ```diff / ```patch fences: gutter sign per line,
// amber filename label, emerald/red counters. streaming-text parses the fence
// and falls back to the plain code shell when no +/- lines exist.

export type DiffLineKind = "context" | "added" | "removed";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

const GUTTER: Record<DiffLineKind, string> = {
  context: "",
  added: "+",
  removed: "−",
};

const LINE_TONE: Record<DiffLineKind, string> = {
  context: "text-foreground/70",
  added:
    "bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300",
  removed: "bg-red-500/[0.08] text-red-700 dark:text-red-300",
};

export function CodeDiff({
  filename,
  lines,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  filename: string;
  lines: readonly DiffLine[];
}) {
  const additions = lines.filter((l) => l.kind === "added").length;
  const deletions = lines.filter((l) => l.kind === "removed").length;
  return (
    <div
      data-slot="code-diff"
      className={cn(
        paper,
        "w-full overflow-hidden rounded-2xl font-mono text-xs",
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-4 pt-3 pb-2 dark:border-white/[0.06]">
        <span className="truncate text-[#d49600] dark:text-[#ffb400]">
          {filename}
        </span>
        <span className={cn(mono, "shrink-0 tabular-nums")}>
          <span className="text-emerald-600 dark:text-emerald-400">
            +{additions}
          </span>{" "}
          <span className="text-red-600 dark:text-red-400">−{deletions}</span>
        </span>
      </div>
      <div className={codeScroll}>
        <div className={cn(codeSurface, "py-2")}>
          {lines.map((line, i) => (
            <div
              key={i}
              className={cn("flex px-3 leading-5", LINE_TONE[line.kind])}
            >
              <span className="w-4 shrink-0 select-none text-center opacity-60">
                {GUTTER[line.kind]}
              </span>
              <span className="whitespace-pre">{line.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Parse unified-diff text: filename from +++/diff --git headers, +/- lines
// become added/removed, everything else context. Null when nothing diff-like.
export function parseDiff(
  text: string,
): { filename: string; lines: DiffLine[] } | null {
  const lines: DiffLine[] = [];
  let filename = "changes";
  for (const raw of text.split("\n")) {
    if (raw.startsWith("+++")) {
      filename = raw.slice(3).trim().replace(/^[ab]\//, "") || filename;
      continue;
    }
    if (raw.startsWith("---")) continue;
    const git = /^diff --git a\/\S+ b\/(\S+)/.exec(raw);
    if (git) {
      filename = git[1];
      continue;
    }
    if (raw.startsWith("@@")) continue;
    if (raw.startsWith("+")) lines.push({ kind: "added", text: raw.slice(1) });
    else if (raw.startsWith("-"))
      lines.push({ kind: "removed", text: raw.slice(1) });
    else lines.push({ kind: "context", text: raw.replace(/^ /, "") });
  }
  return lines.some((l) => l.kind !== "context") ? { filename, lines } : null;
}
