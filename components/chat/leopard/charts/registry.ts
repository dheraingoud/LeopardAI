// Chart form registry — maps a Leopard chart spec onto the props a
// diagrammatic form expects. Pure data in, pure props out, so the mapping is
// testable without a DOM.

export type ChartForm =
  | "bar"
  | "column"
  | "line"
  | "area"
  | "pie"
  | "donut"
  | "grouped-bar"
  | "stacked-bar"
  | "stacked-area"
  | "heatmap"
  | "scatter"
  | "sparkline"
  | "histogram";

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

export type ChartFormProps = {
  items?: ChartItem[];
  data?: number[];
  labels?: string[];
  series?: ChartRow[];
  groups?: string[];
  matrix?: ChartMatrix;
  points?: readonly ChartScatterPoint[];
  bins?: number[];
  inner?: number;
  block?: boolean;
  title?: string;
  xTicks?: number;
  yTicks?: number;
};

export type ChartSpec = {
  form: ChartForm;
  title?: string;
  points?: readonly ChartPoint[];
  series?: readonly ChartSeries[];
  groups?: readonly ChartGroup[];
  matrix?: ChartMatrix;
  scatter?: readonly ChartScatterPoint[];
  bins?: readonly number[];
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

export function chartProps(spec: ChartSpec): ChartFormProps {
  const points = spec.points ?? [];
  const series = seriesToRows(spec.series ?? []);
  const groups = groupsToNames(spec.groups ?? []);
  const title = spec.title;
  switch (spec.form) {
    case "bar":
      return { items: pointsToItems(points), title, xTicks: 4 };
    case "column":
      return { items: pointsToItems(points), title, yTicks: 4 };
    case "line":
      return {
        data: pointsToValues(points),
        labels: pointsToLabels(points),
        title,
        yTicks: 4,
      };
    case "area":
      return {
        data: pointsToValues(points),
        labels: pointsToLabels(points),
        title,
        yTicks: 4,
      };
    case "pie":
      return { items: pointsToItems(points), title };
    case "donut":
      return { items: pointsToItems(points), title, inner: 0.55 };
    case "grouped-bar":
      return { groups, series, title, yTicks: 4 };
    case "stacked-bar":
      return { groups, series, title, yTicks: 4 };
    case "stacked-area":
      return { series, title, yTicks: 4 };
    case "heatmap":
      return { matrix: spec.matrix, title };
    case "scatter":
      return { points: spec.scatter ?? [], title };
    case "sparkline":
      return { data: pointsToValues(points), title, block: true };
    case "histogram":
      return { bins: (spec.bins ?? []).map(numeric), title, yTicks: 4 };
    default:
      return {};
  }
}

export function chartHasData(spec: ChartSpec): boolean {
  return (
    (spec.points?.length ?? 0) > 0 ||
    (spec.series?.length ?? 0) > 0 ||
    (spec.groups?.length ?? 0) > 0 ||
    Boolean(spec.matrix) ||
    (spec.scatter?.length ?? 0) > 0 ||
    (spec.bins?.length ?? 0) > 0
  );
}
