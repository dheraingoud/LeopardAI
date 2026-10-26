// Chart spec bridge — turns a Leopard chart spec into the diagrammatic
// package's own spec, so one upstream renderer draws every chart form.

import {
  type ChartSpec as UpstreamChartSpec,
  validateSpec,
} from "@/aui/diagrammatic/spec";
import {
  type ChartForm,
  type ChartSpec,
  groupsToBinRows,
  groupsToNames,
  groupsToValueRows,
  numeric,
  pointsToItems,
  pointsToLabels,
  pointsToValues,
  seriesToRows,
} from "./registry";

export type { ChartForm };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseRawSpec = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const simple = (
  type: string,
  props: Record<string, unknown>,
): Record<string, unknown> => ({
  v: "dg/1",
  type,
  ...props,
});

const itemsOf = (spec: ChartSpec) => pointsToItems(spec.points ?? []);

const dataOf = (spec: ChartSpec) => pointsToValues(spec.points ?? []);

const labelsOf = (spec: ChartSpec) => pointsToLabels(spec.points ?? []);

const seriesOf = (spec: ChartSpec) => seriesToRows(spec.series ?? []);

const legendOf = (spec: ChartSpec) =>
  (spec.series?.length ?? 0) > 1 ? { legend: true } : {};

const pointsOf = (spec: ChartSpec) =>
  (spec.scatter ?? []).map((point) => ({
    x: numeric(point.x),
    y: numeric(point.y),
    ...(point.label !== undefined ? { label: point.label } : {}),
    ...(point.series !== undefined ? { series: point.series } : {}),
  }));

const axisLabels = (spec: ChartSpec) => ({
  ...(spec.xLabel !== undefined ? { xLabel: spec.xLabel } : {}),
  ...(spec.yLabel !== undefined ? { yLabel: spec.yLabel } : {}),
});

const BUILT: Record<string, (spec: ChartSpec) => Record<string, unknown>> = {
  line: (spec) =>
    simple("line", { data: dataOf(spec), labels: labelsOf(spec), yTicks: 4 }),
  area: (spec) =>
    simple("area", { data: dataOf(spec), labels: labelsOf(spec), yTicks: 4 }),
  "stacked-area": (spec) =>
    simple("stacked-area", {
      series: seriesOf(spec),
      yTicks: 4,
      ...legendOf(spec),
    }),
  streamgraph: (spec) =>
    simple("streamgraph", { series: seriesOf(spec), ...legendOf(spec) }),
  bump: (spec) =>
    simple("bump", {
      series: (spec.series ?? []).map((row) => ({
        name: row.name,
        ranks: row.data.map(numeric),
      })),
      ...(spec.points?.length ? { labels: labelsOf(spec) } : {}),
    }),
  horizon: (spec) => simple("horizon", { data: dataOf(spec) }),
  bar: (spec) => simple("bar", { items: itemsOf(spec), xTicks: 4 }),
  column: (spec) => simple("column", { items: itemsOf(spec), yTicks: 4 }),
  "grouped-bar": (spec) =>
    simple("grouped-bar", {
      groups: groupsToNames(spec.groups ?? []),
      series: seriesOf(spec),
      yTicks: 4,
      ...legendOf(spec),
    }),
  "stacked-bar": (spec) =>
    simple("stacked-bar", {
      groups: groupsToNames(spec.groups ?? []),
      series: seriesOf(spec),
      yTicks: 4,
      ...legendOf(spec),
    }),
  lollipop: (spec) => simple("lollipop", { items: itemsOf(spec) }),
  "dot-plot": (spec) => simple("dot-plot", { items: itemsOf(spec) }),
  leaderboard: (spec) => simple("leaderboard", { items: itemsOf(spec) }),
  pictogram: (spec) => simple("pictogram", { items: itemsOf(spec), unit: 1 }),
  "radial-bar": (spec) => simple("radial-bar", { items: itemsOf(spec) }),
  "polar-area": (spec) => simple("polar-area", { items: itemsOf(spec) }),
  pie: (spec) => simple("pie", { items: itemsOf(spec) }),
  waffle: (spec) => simple("waffle", { items: itemsOf(spec) }),
  funnel: (spec) => simple("funnel", { items: itemsOf(spec) }),
  histogram: (spec) =>
    simple("histogram", { bins: (spec.bins ?? []).map(numeric), yTicks: 4 }),
  ridgeline: (spec) =>
    simple("ridgeline", { rows: groupsToBinRows(spec.groups ?? []) }),
  beeswarm: (spec) => simple("beeswarm", { values: dataOf(spec) }),
  "strip-plot": (spec) =>
    simple("strip-plot", { rows: groupsToValueRows(spec.groups ?? []) }),
  scatter: (spec) =>
    simple("scatter", { points: pointsOf(spec), ...axisLabels(spec) }),
  "connected-scatter": (spec) =>
    simple("connected-scatter", { points: pointsOf(spec), ...axisLabels(spec) }),
  hexbin: (spec) =>
    simple("hexbin", { points: pointsOf(spec), ...axisLabels(spec) }),
  contour: (spec) =>
    simple("contour", { points: pointsOf(spec), ...axisLabels(spec) }),
  heatmap: (spec) =>
    simple("heatmap", {
      matrix: spec.matrix ?? { rows: [], cols: [], values: [] },
    }),
  quadrant: (spec) =>
    simple("quadrant", {
      points: pointsOf(spec),
      xLabel: spec.xLabel ?? "x",
      yLabel: spec.yLabel ?? "y",
    }),
  "diverging-bar": (spec) => simple("diverging-bar", { items: itemsOf(spec) }),
  sparkline: (spec) =>
    simple("sparkline", {
      data: dataOf(spec),
      ...(spec.block !== undefined ? { block: spec.block } : {}),
    }),
  sparkbar: (spec) => simple("sparkbar", { data: dataOf(spec) }),
  "win-loss": (spec) => simple("win-loss", { data: dataOf(spec) }),
  "progress-ring": (spec) =>
    simple("progress-ring", { value: numeric(spec.value) }),
  gauge: (spec) => simple("gauge", { value: numeric(spec.value) }),
  "split-bar": (spec) => simple("split-bar", { items: itemsOf(spec) }),
  donut: (spec) =>
    simple("pie", { items: itemsOf(spec), inner: spec.inner ?? 0.55 }),
};

const GRAPH_FORMS = new Set(["sankey", "network", "arc-diagram"]);

const linkValue = (value: unknown): number => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
};

const graphNodes = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(isRecord)
    : [];

const graphLinks = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(isRecord)
    : [];

const nodeLabel = (node: Record<string, unknown>): string | undefined =>
  typeof node["label"] === "string" && node["label"].length > 0
    ? node["label"]
    : undefined;

const nodeKey = (node: Record<string, unknown>, index: number): string => {
  const id = node["id"];
  if (typeof id === "string" && id.length > 0) return id;
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  const label = nodeLabel(node);
  if (label !== undefined) return label;
  return `node-${index}`;
};

const normalizeGraph = (graph: Record<string, unknown>): Record<string, unknown> => {
  const nodes = graphNodes(graph["nodes"]);
  const keys = nodes.map(nodeKey);
  const byKey = new Map<string, string>();
  const byIndex = new Map<number, string>();
  nodes.forEach((node, index) => {
    const key = keys[index];
    const label = nodeLabel(node);
    if (label !== undefined && !byKey.has(label)) byKey.set(label, key);
    if (!byKey.has(key)) byKey.set(key, key);
    byIndex.set(index, key);
  });
  const resolve = (value: unknown): string | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return byIndex.get(value);
    }
    if (typeof value !== "string") return undefined;
    const direct = byKey.get(value);
    if (direct !== undefined) return direct;
    const index = Number(value);
    if (Number.isInteger(index) && index >= 0) return byIndex.get(index);
    return undefined;
  };
  const links = graphLinks(graph["links"]).flatMap((link) => {
    const source = resolve(link["source"]);
    const target = resolve(link["target"]);
    if (source === undefined || target === undefined) return [];
    const value = linkValue(link["value"]);
    return [{ ...link, source, target, ...(value > 0 ? { value } : {}) }];
  });
  const fixed = nodes.map((node, index) => {
    const label = nodeLabel(node);
    return {
      ...node,
      id: keys[index],
      ...(label !== undefined ? { label } : {}),
    };
  });
  return { ...graph, nodes: fixed, links };
};

export function toUpstreamSpec(spec: ChartSpec): UpstreamChartSpec {
  const raw = parseRawSpec(spec.spec);
  if (isRecord(raw)) {
    const passthrough: Record<string, unknown> = {
      v: "dg/1",
      ...raw,
    };
    if (passthrough["type"] === undefined) passthrough["type"] = spec.form;
    if (spec.title !== undefined) passthrough["title"] = spec.title;
    if (GRAPH_FORMS.has(String(passthrough["type"]))) {
      const graph = passthrough["graph"];
      if (isRecord(graph)) passthrough["graph"] = normalizeGraph(graph);
    }
    return validateSpec(passthrough) as UpstreamChartSpec;
  }
  const build = BUILT[spec.form];
  if (!build) {
    throw new Error(`No Leopard mapping for chart type "${spec.form}".`);
  }
  const built = build(spec);
  if (spec.title !== undefined) built["title"] = spec.title;
  return validateSpec(built) as UpstreamChartSpec;
}

export function upstreamSpecError(spec: ChartSpec): string | null {
  try {
    toUpstreamSpec(spec);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
