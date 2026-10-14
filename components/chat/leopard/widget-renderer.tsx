"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import { Bar, Line, Pie } from "diagrammatic";
import { cn } from "@/lib/utils";
import { paper, mono } from "./surfaces";
import { MermaidDiagram } from "./mermaid-diagram";
import { NumberTicker } from "./number-ticker";
import { ImageGallery } from "./image-gallery";
import type { WidgetSpec } from "@/lib/ai/widget-schema";

const GeoMapLazy = dynamic(
  () => import("./geo-map.js").then((m) => m.GeoMap),
  { ssr: false, loading: () => <div className={cn(paper, "my-2 h-64 animate-pulse rounded-xl")} /> },
) as React.ComponentType<{
  places: { id: string; label: string; lat: number; lng: number; description?: string | undefined }[];
  className?: string;
}>;
// (id is required by GeoMap after MapWidget fills missing ids)

// Generative UI renderer — maps widget specs to Leopard-styled components.
// The model emits a JSON tree via the renderWidget tool; this renders it.
// Each widget type maps to a component with Leopard tokens (amber accents,
// dark/light pairs, paper surfaces).

// Generative UI charts render through the `diagrammatic` package: 68
// zero-dependency, server-safe SVG forms themed by --dg-* tokens (mapped to
// Leopard's --chart-* palette in globals.css). The widget schema's
// { chartType, data: [{ label, value }] } shape is mapped onto Bar/Line/Pie
// here; the model contract is unchanged. Each chart gets `title` for a11y and
// a native tooltip, and the categorical palette + ink resolve through CSS
// variables so dark/light stay correct.

function ChartWidget({ title, data, chartType }: Extract<WidgetSpec, { _type: "chart" }>) {
  // Guard against empty/degenerate data so a bad tool call renders an inert
  // card instead of throwing mid-stream.
  const items = data.filter((d) => Number.isFinite(d.value));
  const body =
    items.length === 0 ? (
      <p className={cn(mono, "text-[11px] text-foreground/40")}>No data</p>
    ) : chartType === "line" ? (
      <Line
        data={items.map((d) => d.value)}
        labels={items.map((d) => d.label)}
        title={title}
        yTicks={4}
      />
    ) : chartType === "pie" ? (
      <Pie items={items} title={title} />
    ) : (
      <Bar items={items} title={title} xTicks={4} />
    );
  return (
    <div className={cn(paper, "rounded-xl p-4 my-2")}>
      <p className={cn(mono, "text-foreground/50 mb-3 text-[11px] uppercase tracking-wider")}>{title}</p>
      <div className="text-foreground">{body}</div>
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
  const numeric = typeof value === "number" ? value : Number(value);
  const isNumeric = Number.isFinite(numeric) && String(value).trim() !== "";
  return (
    <div className={cn(paper, "rounded-xl p-4 my-2 flex flex-col gap-1")}>
      <span className={cn(mono, "text-[11px] uppercase tracking-wider text-foreground/40")}>{label}</span>
      {isNumeric ? (
        <NumberTicker
          value={numeric}
          label=""
          className="items-start gap-0 [&>span:first-child]:text-2xl [&>span:first-child]:font-semibold [&>span:first-child]:dark:text-[#ececec] [&>span:first-child]:light:text-[#171717]"
        />
      ) : (
        <span className="text-2xl font-semibold dark:text-[#ececec] light:text-[#171717]">{value}</span>
      )}
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
  const galleryImages = images.map((img, i) => ({
    id: `img-${i}`,
    src: img.src,
    alt: img.alt,
    caption: img.caption,
  }));
  return (
    <div className="my-2">
      <ImageGallery images={galleryImages} />
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

function DiagramWidget({ code, title }: Extract<WidgetSpec, { _type: "diagram" }>) {
  return (
    <figure className="my-2">
      <MermaidDiagram code={code} className="rounded-xl" />
      {title ? (
        <figcaption className={cn(mono, "text-muted-foreground mt-1 text-[11px]")}>{title}</figcaption>
      ) : null}
    </figure>
  );
}

function MapWidget({ places }: Extract<WidgetSpec, { _type: "map" }>) {
  // Models sometimes send a single place object or a keyed record instead of
  // an array — normalize before it reaches GeoMap.
  const list = Array.isArray(places)
    ? places
    : places && typeof places === "object"
      ? Object.values(places as Record<string, unknown>)
      : [];
  const valid = list.filter(
    (p): p is { id?: string; label: string; lat: number; lng: number; description?: string } =>
      !!p && typeof p === "object" &&
      typeof (p as { lat?: unknown }).lat === "number" &&
      typeof (p as { lng?: unknown }).lng === "number" &&
      typeof (p as { label?: unknown }).label === "string",
  );
  const withIds = valid.map((p, i) => ({ ...p, id: p.id ?? `pin-${i}` }));
  if (withIds.length === 0) return null;
  return (
    <div className="my-2">
      <GeoMapLazy places={withIds} className="h-64 rounded-xl" />
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
    case "diagram": return <DiagramWidget {...spec} />;
    case "map": return <MapWidget {...spec} />;
    default: return null;
  }
});
