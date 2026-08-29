"use client";

import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";

// Leopard fork of the kit DataTable — reshaped for settled ```table fences:
// the block carries CSV (header row + rows) and renders as a hairline grid.
// StreamingText routes here only after the block settles; a headerless or
// ragged payload falls back to a plain code block.

export interface CsvTable {
  header: string[];
  rows: string[][];
}

export function parseCsvTable(code: string): CsvTable | null {
  const lines = code
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return null;
  const parsed = lines.map(parseCsvLine);
  const width = parsed[0].length;
  if (width < 2) return null;
  if (!parsed.every((row) => row.length === width)) return null;
  return { header: parsed[0], rows: parsed.slice(1) };
}

// RFC-4180-ish: quoted fields, "" escapes, no embedded newlines (rows are
// already split on "\n").
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function DataTable({
  header,
  rows,
  className,
}: {
  header: readonly string[];
  rows: readonly (readonly string[])[];
  className?: string;
}) {
  return (
    <div
      data-slot="data-table"
      className={cn(
        paper,
        "my-3 w-full max-w-xl overflow-x-auto rounded-2xl text-[13px]",
        className,
      )}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {header.map((col, i) => (
              <th
                key={i}
                className={cn(
                  mono,
                  "border-foreground/[0.07] border-b px-4 py-2.5 text-start font-normal text-foreground/45",
                )}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr
              key={r}
              className="transition-colors hover:bg-foreground/[0.03]"
            >
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={cn(
                    "border-foreground/[0.05] border-b px-4 py-2 tabular-nums",
                    c === 0
                      ? "text-foreground/90"
                      : "text-end text-foreground/60",
                    r === rows.length - 1 && "border-b-0",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
