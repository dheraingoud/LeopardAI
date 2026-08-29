"use client";

import { useMemo, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Presentational unified-diff viewer. Dep-free port: the upstream used `diff` +
// `parse-diff`; here a tiny LCS line diff and a minimal unified-patch parser
// cover both input shapes. Leopard hairlines + amber-tinted stat colors.

type LineType = "add" | "del" | "normal";

export type DiffLine = {
  type: LineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
};

export type DiffFile = {
  oldName?: string;
  newName?: string;
  lines: DiffLine[];
  additions: number;
  deletions: number;
};

// LCS over whole lines; fine for chat-sized files (hundreds of lines).
export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const m = a.length;
  const n = b.length;
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      lines.push({ type: "normal", content: a[i]!, oldLineNumber: i + 1, newLineNumber: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      lines.push({ type: "del", content: a[i]!, oldLineNumber: i + 1 });
      i++;
    } else {
      lines.push({ type: "add", content: b[j]!, newLineNumber: j + 1 });
      j++;
    }
  }
  while (i < m) lines.push({ type: "del", content: a[i]!, oldLineNumber: ++i });
  while (j < n) lines.push({ type: "add", content: b[j]!, newLineNumber: ++j });
  return lines;
}

// Minimal unified-patch parser (---/+++/@@ hunks, +/-/' ' lines).
export function parsePatch(patch: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let oldLine = 0;
  let newLine = 0;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("--- ")) {
      file = { oldName: raw.slice(4).replace(/^[ab]\//, "").trim(), lines: [], additions: 0, deletions: 0 };
      files.push(file);
    } else if (raw.startsWith("+++ ") && file) {
      file.newName = raw.slice(4).replace(/^[ab]\//, "").trim();
    } else if (raw.startsWith("@@") && file) {
      const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (match) {
        oldLine = Number(match[1]);
        newLine = Number(match[2]);
      }
    } else if (file && raw.startsWith("+")) {
      file.additions++;
      file.lines.push({ type: "add", content: raw.slice(1), newLineNumber: newLine++ });
    } else if (file && raw.startsWith("-")) {
      file.deletions++;
      file.lines.push({ type: "del", content: raw.slice(1), oldLineNumber: oldLine++ });
    } else if (file && raw.startsWith(" ")) {
      file.lines.push({ type: "normal", content: raw.slice(1), oldLineNumber: oldLine++, newLineNumber: newLine++ });
    }
  }
  return files;
}

const lineBg: Record<LineType | "empty", string> = {
  add: "dark:bg-[#3fb950]/[0.08] light:bg-[#1a7f37]/[0.08]",
  del: "dark:bg-[#f85149]/[0.08] light:bg-[#cf222e]/[0.08]",
  normal: "",
  empty: "",
};

const lineText: Record<LineType | "empty", string> = {
  add: "dark:text-[#3fb950] light:text-[#1a7f37]",
  del: "dark:text-[#f85149] light:text-[#cf222e]",
  normal: "",
  empty: "",
};

function DiffLineRow({ line, showLineNumbers = true }: { line: DiffLine; showLineNumbers?: boolean }) {
  const indicator = line.type === "add" ? "+" : line.type === "del" ? "-" : " ";
  return (
    <div data-slot="diff-viewer-line" data-type={line.type} className={cn("flex", lineBg[line.type])}>
      {showLineNumbers && (
        <span className="w-12 shrink-0 select-none px-2 text-end text-foreground/30">
          {line.type === "del" ? line.oldLineNumber : (line.newLineNumber ?? line.oldLineNumber)}
        </span>
      )}
      <span className={cn("w-4 shrink-0 select-none text-center", lineText[line.type])}>{indicator}</span>
      <span className={cn("flex-1 break-all whitespace-pre-wrap", lineText[line.type])}>{line.content}</span>
    </div>
  );
}

export type DiffViewerProps = ComponentProps<"div"> & {
  patch?: string;
  oldFile?: { content: string; name?: string };
  newFile?: { content: string; name?: string };
  showLineNumbers?: boolean;
  showStats?: boolean;
};

export function DiffViewer({
  patch,
  oldFile,
  newFile,
  showLineNumbers = true,
  showStats = true,
  className,
  ...props
}: DiffViewerProps) {
  const files = useMemo<DiffFile[]>(() => {
    if (patch) return parsePatch(patch);
    if (oldFile && newFile) {
      const lines = computeDiff(oldFile.content, newFile.content);
      return [
        {
          oldName: oldFile.name,
          newName: newFile.name,
          lines,
          additions: lines.filter((l) => l.type === "add").length,
          deletions: lines.filter((l) => l.type === "del").length,
        },
      ];
    }
    return [];
  }, [patch, oldFile, newFile]);

  if (files.length === 0) {
    return (
      <pre data-slot="diff-viewer" className={cn("rounded-lg p-4 font-mono text-xs text-foreground/40", className)}>
        No diff content provided
      </pre>
    );
  }

  return (
    <div
      data-slot="diff-viewer"
      className={cn(
        "overflow-hidden rounded-lg border font-mono text-xs dark:border-white/[0.08] light:border-black/[0.08]",
        className,
      )}
      {...props}
    >
      {files.map((file, i) => (
        <div key={i} data-slot="diff-viewer-file">
          {(file.oldName || file.newName) && (
            <div className="flex items-center gap-2 border-b px-4 py-2 text-foreground/60 dark:border-white/[0.06] light:border-black/[0.06]">
              <span className="flex-1 truncate">
                {file.oldName && file.newName && file.oldName !== file.newName ? (
                  <>
                    <span className={lineText.del}>{file.oldName}</span>
                    {" → "}
                    <span className={lineText.add}>{file.newName}</span>
                  </>
                ) : (
                  (file.newName ?? file.oldName)
                )}
              </span>
              {showStats && (file.additions > 0 || file.deletions > 0) && (
                <span className="flex gap-2">
                  <span className={lineText.add}>+{file.additions}</span>
                  <span className={lineText.del}>-{file.deletions}</span>
                </span>
              )}
            </div>
          )}
          <div data-slot="diff-viewer-content" className="overflow-x-auto">
            {file.lines.map((line, j) => (
              <DiffLineRow key={j} line={line} showLineNumbers={showLineNumbers} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
