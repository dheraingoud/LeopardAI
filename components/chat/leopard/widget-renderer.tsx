"use client";

import { memo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { paper, mono } from "./surfaces";
import { MermaidDiagram } from "./mermaid-diagram";
import { NumberTicker } from "./number-ticker";
import { ImageGallery } from "./image-gallery";
import { FormWidget } from "./form-widget";
import { LeopardChart } from "./charts/chart-figure";
import { chartHasData } from "./charts/registry";
import { normalizeFormFields, type WidgetSpec } from "@/lib/ai/widget-schema";

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

function ChartWidget({
  title,
  data,
  series,
  groups,
  matrix,
  scatter,
  bins,
  value,
  xLabel,
  yLabel,
  spec: rawSpec,
  chartType,
}: Extract<WidgetSpec, { _type: "chart" }>) {
  const points = (data ?? []).filter((d) => Number.isFinite(d.value));
  const spec = {
    form: chartType,
    title,
    points,
    series,
    groups,
    matrix,
    scatter,
    bins,
    value,
    xLabel,
    yLabel,
    spec: rawSpec,
  };
  if (!chartHasData(spec)) {
    return (
      <div className={cn(paper, "rounded-xl p-4 my-2")}>
        <p className={cn(mono, "text-[11px] text-foreground/40")}>No data</p>
      </div>
    );
  }
  return <LeopardChart spec={spec} />;
}

// Table sorting (aui tableData.ts patterns): numbers sort numerically
// (finite first), strings via Intl.Collator numeric, stable by original index,
// click cycles asc → desc → clear.
type TableSort = { column: number; direction: "ascending" | "descending" };
const tableCollator = new Intl.Collator("en-US", { numeric: true });
function compareTableCells(left: string | number, right: string | number): number {
  const ln = typeof left === "number" && Number.isFinite(left);
  const rn = typeof right === "number" && Number.isFinite(right);
  if (ln && rn) return (left as number) - (right as number);
  if (ln) return -1;
  if (rn) return 1;
  return tableCollator.compare(String(left), String(right));
}

function TableWidget({ title, columns, rows }: Extract<WidgetSpec, { _type: "table" }>) {
  const [sort, setSort] = useState<TableSort | undefined>(undefined);
  const sorted = sort
    ? rows
        .map((row, index) => ({ row, index }))
        .sort((l, r) => {
          const c = compareTableCells(l.row[sort.column] ?? "", r.row[sort.column] ?? "");
          const ordered = sort.direction === "ascending" ? c : -c;
          return ordered === 0 ? l.index - r.index : ordered;
        })
        .map(({ row }) => row)
    : rows;
  return (
    <div className={cn(paper, "rounded-xl overflow-hidden my-2")}>
      {title && <p className={cn(mono, "px-4 pt-3 pb-2 text-[11px] uppercase tracking-wider text-foreground/50")}>{title}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b dark:border-white/[0.06] light:border-black/[0.06]">
              {columns.map((col, i) => {
                const active = sort?.column === i;
                return (
                  <th key={i} className="px-4 py-2 text-left font-medium dark:text-[#8a8a8a] light:text-[#6a6a6a]">
                    <button
                      type="button"
                      className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors"
                      onClick={() =>
                        setSort((cur) =>
                          cur?.column !== i
                            ? { column: i, direction: "ascending" }
                            : cur.direction === "ascending"
                              ? { column: i, direction: "descending" }
                              : undefined,
                        )
                      }
                    >
                      {col}
                      {active ? (
                        sort.direction === "ascending" ? (
                          <ChevronUpIcon className="size-3" />
                        ) : (
                          <ChevronDownIcon className="size-3" />
                        )
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
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

// Streaming-partial guard: while the tool args are still arriving (fixJson
// repairs a partial string), required props may be missing or the wrong type.
// Render a skeleton until the spec is complete enough to render safely.
function WidgetSkeleton({ label }: { label: string }) {
  return (
    <div className={cn(paper, "rounded-xl p-4 my-2 animate-pulse")}>
      <p className={cn(mono, "text-foreground/40 text-[11px] uppercase tracking-wider")}>{label}</p>
      <div className="mt-2 h-16 rounded-lg bg-foreground/[0.05]" />
    </div>
  );
}

const specReady = (spec: WidgetSpec): boolean => {
  switch (spec._type) {
    case "chart":
      return (
        Boolean(spec.spec) ||
        typeof spec.value === "number" ||
        (Array.isArray(spec.data) && spec.data.length > 0) ||
        (Array.isArray(spec.series) && spec.series.length > 0) ||
        (Array.isArray(spec.groups) && spec.groups.length > 0) ||
        Boolean(spec.matrix) ||
        (Array.isArray(spec.scatter) && spec.scatter.length > 0) ||
        (Array.isArray(spec.bins) && spec.bins.length > 0)
      );
    case "table": return Array.isArray(spec.columns) && Array.isArray(spec.rows);
    case "stat": return spec.value !== undefined;
    case "progress": return typeof spec.value === "number";
    case "form": return normalizeFormFields(spec.fields).length > 0;
    case "gallery": return Array.isArray(spec.images) && spec.images.length > 0;
    case "code": return typeof spec.code === "string" && spec.code.length > 0;
    case "diagram": return typeof spec.code === "string" && spec.code.length > 0;
    case "map": return Array.isArray(spec.places) && spec.places.length > 0;
    default: return false;
  }
};

export const WidgetRenderer = memo(function WidgetRenderer({ spec }: { spec: WidgetSpec }) {
  if (!spec || typeof spec !== "object" || !("_type" in spec)) return null;
  if (!specReady(spec)) return <WidgetSkeleton label={String(spec._type)} />;
  switch (spec._type) {
    case "chart": return <ChartWidget {...spec} />;
    case "table": return <TableWidget {...spec} />;
    case "stat": return <StatWidget {...spec} />;
    case "progress": return <ProgressWidget {...spec} />;
    case "form": return <FormWidget {...spec} />;
    case "gallery": return <GalleryWidget {...spec} />;
    case "code": return <CodeWidget {...spec} />;
    case "diagram": return <DiagramWidget {...spec} />;
    case "map": return <MapWidget {...spec} />;
    default: return null;
  }
});
