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
      .slice(0, 12);
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
  const max = Math.max(...series.map((p) => p.value), 0);
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
      <div className="flex flex-col gap-2">
        {series.map((p, i) => {
          const top = p.value === max && max > 0;
          return (
            <div key={`${p.label}-${i}`} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-[13px] text-foreground/70">
                {p.label}
              </span>
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                <div
                  className={cn(
                    "fade-in animate-in slide-in-from-left-2 fill-mode-both h-full rounded-full duration-500",
                    top
                      ? "bg-[#ffb400] light:bg-[#d49600]"
                      : "bg-foreground/25",
                  )}
                  style={{
                    width: `${max > 0 ? Math.max((p.value / max) * 100, 2) : 0}%`,
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
