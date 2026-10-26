"use client";

import {
  Area,
  Bar,
  Column,
  GroupedBar,
  Heatmap,
  Histogram,
  Line,
  Pie,
  Scatter,
  Sparkline,
  StackedArea,
  StackedBar,
} from "@/aui/diagrammatic";
import { cn } from "@/lib/utils";
import { mono, paper } from "../surfaces";
import { chartProps, numeric, type ChartSpec } from "./registry";

// Leopard chart surface — the forked diagrammatic forms, re-exported under
// Leopard names and themed with the --dg-* palette globals.css already maps
// onto --chart-*.

function ChartFigure({ spec }: { spec: ChartSpec }) {
  const p = chartProps(spec);
  switch (spec.form) {
    case "bar":
      return <Bar items={p.items ?? []} title={p.title} xTicks={p.xTicks} />;
    case "column":
      return <Column items={p.items ?? []} title={p.title} yTicks={p.yTicks} />;
    case "line":
      return (
        <Line
          data={p.data}
          labels={p.labels}
          title={p.title}
          yTicks={p.yTicks}
        />
      );
    case "area":
      return (
        <Area
          data={p.data}
          labels={p.labels}
          title={p.title}
          yTicks={p.yTicks}
        />
      );
    case "pie":
      return <Pie items={p.items ?? []} title={p.title} />;
    case "donut":
      return (
        <Pie items={p.items ?? []} title={p.title} inner={p.inner ?? 0.55} />
      );
    case "grouped-bar":
      return (
        <GroupedBar
          groups={p.groups ?? []}
          series={p.series ?? []}
          title={p.title}
          yTicks={p.yTicks}
        />
      );
    case "stacked-bar":
      return (
        <StackedBar
          groups={p.groups ?? []}
          series={p.series ?? []}
          title={p.title}
          yTicks={p.yTicks}
        />
      );
    case "stacked-area":
      return (
        <StackedArea series={p.series ?? []} title={p.title} yTicks={p.yTicks} />
      );
    case "heatmap":
      return p.matrix ? (
        <Heatmap
          matrix={{
            rows: p.matrix.rows,
            cols: p.matrix.cols,
            values: p.matrix.values.map((row) => row.map(numeric)),
          }}
          title={p.title}
        />
      ) : null;
    case "scatter":
      return (
        <Scatter
          points={(p.points ?? []).map((point) => ({
            x: numeric(point.x),
            y: numeric(point.y),
            label: point.label,
            series: point.series,
          }))}
          title={p.title}
        />
      );
    case "sparkline":
      return <Sparkline data={p.data ?? []} title={p.title} block={p.block} />;
    case "histogram":
      return <Histogram bins={p.bins ?? []} title={p.title} yTicks={p.yTicks} />;
    default:
      return null;
  }
}

export function LeopardChart({ spec }: { spec: ChartSpec }) {
  return (
    <div data-dg-motion="" className={cn(paper, "rounded-xl p-4 my-2")}>
      {spec.title ? (
        <p
          className={cn(
            mono,
            "text-foreground/50 mb-3 text-[11px] uppercase tracking-wider",
          )}
        >
          {spec.title}
        </p>
      ) : null}
      <div className="text-foreground overflow-x-auto">
        <ChartFigure spec={spec} />
      </div>
    </div>
  );
}
