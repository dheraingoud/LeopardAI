"use client";

import { cn } from "@/lib/utils";
import { mono, paper } from "./surfaces";

// Leopard fork of the kit Chart — reshaped for settled ```chart fences:
// a JSON spec { title?, series: {label, value}[] } renders as amber bars.
// StreamingText routes here only after the block settles; parse failures
// fall back to a plain code block.

export interface ChartSeriesPoint {
  label: string;
  value: number;
}

export interface ChartSpec {
  title?: string;
  series: ChartSeriesPoint[];
}

/**
 * Salvage a mermaid-ish barChart fence into a ChartSpec (audit 2026-10-09):
 * models invent `barChart` / `xychart-beta` mermaid syntax — mermaid can't
 * render it and the diagram soft-failed. Parse the common shapes:
 *   barChart
 *     title Fruits by Count
 *     Apple: 12
 *     Banana: 7
 * Returns null when the shape isn't a salvageable bar chart.
 */
export function salvageMermaidBarChart(code: string): ChartSpec | null {
  const lines = code
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  if (!/^(barChart|xychart-beta)\b/i.test(lines[0])) return null;

  let title: string | undefined;
  const series: ChartSeriesPoint[] = [];
  for (const line of lines.slice(1)) {
    const t = /^title\s+(.+)$/i.exec(line);
    if (t) {
      title = t[1].trim();
      continue;
    }
    if (/^(xAxis|yAxis)\b/i.test(line)) continue; // axis labels — drop
    const kv = /^(.+?)\s*:\s*(-?\d+(?:\.\d+)?)$/.exec(line);
    if (kv) {
      series.push({ label: kv[1].trim(), value: Number(kv[2]) });
      continue;
    }
    // xychart shape: `bar [1, 2, 3]` — values without labels.
    const arr = /^(?:bar|line)\s*\[([\d.,\s-]+)\]$/i.exec(line);
    if (arr) {
      arr[1]
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isFinite(v))
        .forEach((v, i) => series.push({ label: `Series ${i + 1}`, value: v }));
    }
  }
  if (series.length === 0) return null;
  return { title, series };
}

export function parseChartSpec(code: string): ChartSpec | null {
  try {
    const raw = JSON.parse(code) as Partial<ChartSpec>;
    if (!raw || !Array.isArray(raw.series) || raw.series.length === 0) {
      return null;
    }
    const series = raw.series
      .filter(
        (p): p is ChartSeriesPoint =>
          !!p &&
          typeof (p as ChartSeriesPoint).label === "string" &&
          typeof (p as ChartSeriesPoint).value === "number" &&
          Number.isFinite((p as ChartSeriesPoint).value),
      )
      // Cap for layout, but AGGREGATE the tail into "other" instead of
      // silently dropping it (audit 2026-10-09, deep-sweep #7).
      .reduce<ChartSeriesPoint[]>((acc, p, i) => {
        if (i < 11) acc.push(p);
        else if (acc.length === 11) acc.push({ label: "Other", value: p.value });
        else acc[11].value += p.value;
        return acc;
      }, []);
    if (series.length === 0) return null;
    return {
      title: typeof raw.title === "string" ? raw.title : undefined,
      series,
    };
  } catch {
    return null;
  }
}

export function BarChart({
  title,
  series,
  className,
}: {
  title?: string;
  series: readonly ChartSeriesPoint[];
  className?: string;
}) {
  // Scale by max |value| so an all-negative series still draws bars (audit
  // 2026-10-09: Math.max(…,0) gave max=0 → every bar zero-width).
  const max = Math.max(...series.map((p) => Math.abs(p.value)), 0);
  return (
    <figure
      data-slot="bar-chart"
      className={cn(paper, "my-3 w-full max-w-md rounded-2xl p-4", className)}
    >
      {title && (
        <figcaption className={cn(mono, "mb-3 text-foreground/45")}>
          {title}
        </figcaption>
      )}
      <div className="flex flex-col gap-2" role="list" aria-label={title ?? "Chart"}>
        {series.map((p, i) => {
          const top = Math.abs(p.value) === max && max > 0;
          return (
            <div key={`${p.label}-${i}`} className="flex items-center gap-3" role="listitem">
              <span className="w-24 shrink-0 truncate text-[13px] text-foreground/70">
                {p.label}
              </span>
              {/* a11y (audit 2026-10-10): the bar is visual-only — announce the
                  value with role=img + a labeled bar. */}
              <div
                className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]"
                role="img"
                aria-label={`${p.label}: ${formatValue(p.value)}`}
              >
                <div
                  className={cn(
                    "fade-in animate-in slide-in-from-left-2 fill-mode-both h-full rounded-full duration-500",
                    top
                      ? "bg-[#ffb400] light:bg-[#d49600]"
                      : "bg-foreground/25",
                  )}
                  style={{
                    width: `${max > 0 ? Math.max((Math.abs(p.value) / max) * 100, 2) : 0}%`,
                    animationDelay: `${i * 60}ms`,
                  }}
                />
              </div>
              <span
                className={cn(
                  mono,
                  "w-16 shrink-0 text-end tabular-nums",
                  top ? "text-foreground/90" : "text-foreground/55",
                )}
                aria-hidden="true"
              >
                {formatValue(p.value)}
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 1000) {
    return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
}
