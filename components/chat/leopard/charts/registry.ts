// Chart form registry — the data shapes a chart spec carries, and the upstream
// diagrammatic form names each shape can be rendered as.

export const CHART_FORM_NAMES = [
  "line",
  "area",
  "stacked-area",
  "streamgraph",
  "mirrored-area",
  "slope",
  "bump",
  "candlestick",
  "horizon",
  "gantt",
  "bar",
  "column",
  "grouped-bar",
  "stacked-bar",
  "lollipop",
  "dot-plot",
  "range-bar",
  "leaderboard",
  "pictogram",
  "radial-bar",
  "polar-area",
  "pie",
  "waffle",
  "treemap",
  "sunburst",
  "icicle",
  "circle-packing",
  "marimekko",
  "funnel",
  "histogram",
  "box-plot",
  "violin",
  "ridgeline",
  "beeswarm",
  "strip-plot",
  "population-pyramid",
  "scatter",
  "connected-scatter",
  "hexbin",
  "contour",
  "heatmap",
  "quadrant",
  "parallel-coordinates",
  "radar",
  "diverging-bar",
  "diverging-stacked",
  "dumbbell",
  "difference-area",
  "sankey",
  "chord",
  "waterfall",
  "network",
  "arc-diagram",
  "tree",
  "dendrogram",
  "venn",
  "upset",
  "choropleth",
  "symbol-map",
  "dot-map",
  "flow-map",
  "sparkline",
  "sparkbar",
  "win-loss",
  "bullet",
  "progress-ring",
  "gauge",
  "split-bar",
] as const;

export type ChartForm = (typeof CHART_FORM_NAMES)[number] | "donut";

export const CHART_FORMS: readonly ChartForm[] = [...CHART_FORM_NAMES, "donut"];

export type ChartPoint = {
  label?: string;
  value: number;
};

export type ChartSeries = {
  name: string;
  data: number[];
};

export type ChartGroup = {
  name: string;
  values: number[];
};

export type ChartMatrix = {
  rows: string[];
  cols: string[];
  values: number[][];
};

export type ChartScatterPoint = {
  x: number;
  y: number;
  label?: string;
  series?: string;
};

export type ChartItem = { label: string; value: number };
export type ChartRow = { name: string; data: number[] };

export type ChartSpec = {
  form: string;
  title?: string;
  points?: readonly ChartPoint[];
  series?: readonly ChartSeries[];
  groups?: readonly ChartGroup[];
  matrix?: ChartMatrix;
  scatter?: readonly ChartScatterPoint[];
  bins?: readonly number[];
  value?: number;
  xLabel?: string;
  yLabel?: string;
  inner?: number;
  block?: boolean;
  spec?: unknown;
};

export const numeric = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export const pointsToItems = (points: readonly ChartPoint[]): ChartItem[] =>
  points.map((p, i) => ({
    label: p.label ?? String(i + 1),
    value: numeric(p.value),
  }));

export const pointsToValues = (points: readonly ChartPoint[]): number[] =>
  points.map((p) => numeric(p.value));

export const pointsToLabels = (points: readonly ChartPoint[]): string[] =>
  points.map((p, i) => p.label ?? String(i + 1));

export const seriesToRows = (series: readonly ChartSeries[]): ChartRow[] =>
  series.map((s) => ({ name: s.name, data: s.data.map(numeric) }));

export const groupsToNames = (groups: readonly ChartGroup[]): string[] =>
  groups.map((g) => g.name);

export const groupsToValueRows = (
  groups: readonly ChartGroup[],
): { label: string; values: number[] }[] =>
  groups.map((g) => ({ label: g.name, values: g.values.map(numeric) }));

export const groupsToBinRows = (
  groups: readonly ChartGroup[],
): { label: string; bins: number[] }[] =>
  groups.map((g) => ({ label: g.name, bins: g.values.map(numeric) }));

export function chartHasData(spec: ChartSpec): boolean {
  return (
    spec.spec !== undefined ||
    (spec.points?.length ?? 0) > 0 ||
    (spec.series?.length ?? 0) > 0 ||
    (spec.groups?.length ?? 0) > 0 ||
    Boolean(spec.matrix) ||
    (spec.scatter?.length ?? 0) > 0 ||
    (spec.bins?.length ?? 0) > 0 ||
    typeof spec.value === "number"
  );
}
