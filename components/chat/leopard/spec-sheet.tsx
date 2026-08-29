"use client";

import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";

// Leopard fork of the kit SpecSheet — settled ```spec fences carry JSON
// { title?, fields: {label, value}[] } and render as a label/value sheet.
// StreamingText routes here only after the block settles; bad JSON falls
// back to a plain code block.

export interface SpecField {
  label: string;
  value: string;
}

export interface SpecSheetData {
  title?: string;
  fields: SpecField[];
}

export function parseSpecSheet(code: string): SpecSheetData | null {
  try {
    const raw = JSON.parse(code) as Partial<SpecSheetData>;
    if (!raw || !Array.isArray(raw.fields) || raw.fields.length === 0) {
      return null;
    }
    const fields = raw.fields.filter(
      (f): f is SpecField =>
        !!f &&
        typeof (f as SpecField).label === "string" &&
        typeof (f as SpecField).value === "string",
    );
    if (fields.length === 0) return null;
    return {
      title: typeof raw.title === "string" ? raw.title : undefined,
      fields,
    };
  } catch {
    return null;
  }
}

export function SpecSheet({
  title,
  fields,
  className,
}: {
  title?: string;
  fields: readonly SpecField[];
  className?: string;
}) {
  return (
    <div
      data-slot="spec-sheet"
      className={cn(
        paper,
        "my-3 flex w-full max-w-sm flex-col gap-3 rounded-2xl p-4",
        className,
      )}
    >
      {title && <span className="text-[13.5px] font-medium">{title}</span>}
      <div className="flex flex-col">
        {fields.map((f, i) => (
          <div
            key={`${f.label}-${i}`}
            className="border-foreground/[0.06] flex items-baseline gap-3 border-t py-1.5 first:border-t-0 first:pt-0"
          >
            <span className={cn(mono, "w-24 shrink-0 text-foreground/35")}>
              {f.label}
            </span>
            <span className="min-w-0 flex-1 text-end text-[13px] tabular-nums text-foreground/75">
              {f.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
