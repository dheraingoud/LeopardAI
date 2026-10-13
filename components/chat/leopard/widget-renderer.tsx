"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import { paper, mono } from "./surfaces";
import type { WidgetSpec } from "@/lib/ai/widget-schema";

// Generative UI renderer — maps widget specs to Leopard-styled components.
// The model emits a JSON tree via the renderWidget tool; this renders it.
// Each widget type maps to a component with Leopard tokens (amber accents,
// dark/light pairs, paper surfaces).

function ChartWidget({ title, data, chartType }: Extract<WidgetSpec, { _type: "chart" }>) {
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div className={cn(paper, "rounded-xl p-4 my-2")}>
      <p className={cn(mono, "text-foreground/50 mb-3 text-[11px] uppercase tracking-wider")}>{title}</p>
      <div className="flex flex-col gap-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={cn(mono, "w-20 truncate text-[11px] text-foreground/60")}>{d.label}</span>
            <div className="flex-1 h-5 rounded-sm bg-foreground/[0.06] overflow-hidden">
              <div
                className="h-full rounded-sm dark:bg-[#ffb400] light:bg-[#d49600] transition-all duration-300"
                style={{ width: `${(d.value / max) * 100}%` }}
              />
            </div>
            <span className={cn(mono, "text-[11px] tabular-nums text-foreground/70 w-12 text-right")}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TableWidget({ title, columns, rows }: Extract<WidgetSpec, { _type: "table" }>) {
  return (
    <div className={cn(paper, "rounded-xl overflow-hidden my-2")}>
      {title && <p className={cn(mono, "px-4 pt-3 pb-2 text-[11px] uppercase tracking-wider text-foreground/50")}>{title}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b dark:border-white/[0.06] light:border-black/[0.06]">
              {columns.map((col, i) => (
                <th key={i} className="px-4 py-2 text-left font-medium dark:text-[#8a8a8a] light:text-[#6a6a6a]">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b last:border-0 dark:border-white/[0.04] light:border-black/[0.04]">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2 dark:text-[#d5d5d5] light:text-[#262626]">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatWidget({ label, value, change, trend }: Extract<WidgetSpec, { _type: "stat" }>) {
  return (
    <div className={cn(paper, "rounded-xl p-4 my-2 flex flex-col gap-1")}>
      <span className={cn(mono, "text-[11px] uppercase tracking-wider text-foreground/40")}>{label}</span>
      <span className="text-2xl font-semibold dark:text-[#ececec] light:text-[#171717]">{value}</span>
      {change && (
        <span className={cn(
          "text-xs font-mono",
          trend === "up" && "text-emerald-500",
          trend === "down" && "text-red-500",
          !trend && "text-foreground/50",
        )}>
          {change}
        </span>
      )}
    </div>
  );
}

function ProgressWidget({ label, value, status }: Extract<WidgetSpec, { _type: "progress" }>) {
  return (
    <div className={cn(paper, "rounded-xl p-4 my-2")}>
      <div className="flex items-center justify-between mb-2">
        <span className={cn(mono, "text-[11px] text-foreground/50")}>{label}</span>
        <span className={cn(mono, "text-[11px] tabular-nums text-foreground/70")}>{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-foreground/[0.06] overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            status === "error" ? "bg-red-500" : status === "complete" ? "bg-emerald-500" : "dark:bg-[#ffb400] light:bg-[#d49600]",
          )}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function GalleryWidget({ images }: Extract<WidgetSpec, { _type: "gallery" }>) {
  return (
    <div className="my-2 grid grid-cols-2 gap-2">
      {images.map((img, i) => (
        <figure key={i} className="flex flex-col gap-1">
          <img src={img.src} alt={img.alt} className="rounded-lg w-full object-cover aspect-video" />
          {img.caption && (
            <figcaption className={cn(mono, "text-[10px] text-foreground/40")}>{img.caption}</figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

function CodeWidget({ language, code, title }: Extract<WidgetSpec, { _type: "code" }>) {
  return (
    <div className={cn(paper, "rounded-xl overflow-hidden my-2")}>
      <div className="flex items-center justify-between px-3 py-2 border-b dark:border-white/[0.06] light:border-black/[0.06]">
        <span className={cn(mono, "text-[11px] text-foreground/50")}>{title ?? language}</span>
      </div>
      <pre className="p-3 overflow-x-auto text-[12px] leading-relaxed font-mono dark:text-[#d5d5d5] light:text-[#262626]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export const WidgetRenderer = memo(function WidgetRenderer({ spec }: { spec: WidgetSpec }) {
  switch (spec._type) {
    case "chart": return <ChartWidget {...spec} />;
    case "table": return <TableWidget {...spec} />;
    case "stat": return <StatWidget {...spec} />;
    case "progress": return <ProgressWidget {...spec} />;
    case "gallery": return <GalleryWidget {...spec} />;
    case "code": return <CodeWidget {...spec} />;
    default: return null;
  }
});
