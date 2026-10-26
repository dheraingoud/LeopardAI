// Generative UI widget schema — the model emits a JSON tree, the frontend
// renders it as interactive React components. Each widget has a `_type` that
// selects the component and props inline.
import { z } from "zod";
import { CHART_FORMS } from "@/components/chat/leopard/charts/registry";

const widgetBase = z.object({
  _type: z.string().describe("Widget type: chart, table, stat, progress, form, gallery, code, diagram, map"),
});

// Models sometimes JSON-stringify nested arrays/objects inside the tool-call
// args — accept a string and parse it.
const jsonStringArray = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess(
    (v) => (typeof v === "string" ? JSON.parse(v) : v),
    z.array(item),
  );

const jsonStringObject = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  },
  z.looseObject({ type: z.string().optional() }),
);

const chartPoint = z.object({
  label: z.string().optional(),
  value: z.number(),
});

const chartSeries = z.object({
  name: z.string(),
  data: jsonStringArray(z.number()),
});

const chartGroup = z.object({
  name: z.string(),
  values: jsonStringArray(z.number()),
});

const chartMatrix = z.object({
  rows: jsonStringArray(z.string()),
  cols: jsonStringArray(z.string()),
  values: jsonStringArray(jsonStringArray(z.number())),
});

const chartScatterPoint = z.object({
  x: z.number(),
  y: z.number(),
  label: z.string().optional(),
  series: z.string().optional(),
});

const chartWidget = widgetBase.extend({
  _type: z.literal("chart"),
  chartType: z
    .enum(CHART_FORMS)
    .describe(
      "Chart type. Simple forms read `data` (labelled values) — bar, column, line, area, pie, donut, lollipop, dot-plot, leaderboard, radial-bar, polar-area, waffle, funnel, diverging-bar, split-bar, sparkline, sparkbar, win-loss, horizon, beeswarm. `series` (+ `groups`) for grouped-bar, stacked-bar, stacked-area, streamgraph, bump. `groups` also carries ridgeline and strip-plot rows. `matrix` for heatmap. `scatter` for scatter, connected-scatter, hexbin, contour, quadrant. `bins` for histogram. `value` for gauge and progress-ring. Forms needing other shapes (sankey, network, treemap, tree, gantt, waterfall, radar, venn, bullet, choropleth, …) must carry a `spec` payload.",
    ),
  title: z.string().describe("Chart title"),
  data: jsonStringArray(chartPoint)
    .optional()
    .describe("Data points for the single-series forms"),
  series: jsonStringArray(chartSeries)
    .optional()
    .describe("Named series for grouped-bar/stacked-bar/stacked-area"),
  groups: jsonStringArray(chartGroup)
    .optional()
    .describe("Category groups for grouped-bar/stacked-bar/stacked-area"),
  matrix: chartMatrix.optional().describe("Row/column grid for heatmap"),
  scatter: jsonStringArray(chartScatterPoint)
    .optional()
    .describe("x/y points for scatter"),
  bins: jsonStringArray(z.number())
    .optional()
    .describe("Bin counts for histogram"),
  value: z.number().optional().describe("Single value for gauge and progress-ring"),
  xLabel: z.string().optional().describe("x-axis label for the point-driven forms"),
  yLabel: z.string().optional().describe("y-axis label for the point-driven forms"),
  spec: jsonStringObject
    .optional()
    .describe(
      "Raw diagrammatic chart spec for forms the simple fields cannot express: { type, v: \"dg/1\", ...form-specific props }. When present it replaces the simple fields.",
    ),
});

const tableWidget = widgetBase.extend({
  _type: z.literal("table"),
  title: z.string().optional().describe("Table title"),
  columns: jsonStringArray(z.string()).describe("Column headers"),
  rows: jsonStringArray(z.array(z.union([z.string(), z.number()]))).describe("Row data"),
});

const statWidget = widgetBase.extend({
  _type: z.literal("stat"),
  label: z.string().describe("Stat label"),
  value: z.union([z.string(), z.number()]).describe("Stat value"),
  change: z.string().optional().describe("Change indicator (e.g. '+12%')"),
  trend: z.enum(["up", "down", "neutral"]).optional(),
});

const progressWidget = widgetBase.extend({
  _type: z.literal("progress"),
  label: z.string().describe("Progress label"),
  value: z.number().min(0).max(100).describe("Progress percentage 0-100"),
  status: z.enum(["active", "complete", "error"]).optional(),
});

const formWidget = widgetBase.extend({
  _type: z.literal("form"),
  title: z.string().describe("Form title"),
  fields: jsonStringArray(z.object({
    name: z.string(),
    label: z.string(),
    type: z.enum(["text", "number", "email", "select", "textarea"]),
    placeholder: z.string().optional(),
    options: z.array(z.string()).optional().describe("For select fields"),
  })),
  submitLabel: z.string().optional().describe("Submit button text"),
});

const galleryWidget = widgetBase.extend({
  _type: z.literal("gallery"),
  images: jsonStringArray(z.object({
    src: z.string().url(),
    alt: z.string(),
    caption: z.string().optional(),
  })).describe("Images to display"),
});

const codeWidget = widgetBase.extend({
  _type: z.literal("code"),
  language: z.string().describe("Programming language"),
  code: z.string().describe("Code content"),
  title: z.string().optional(),
});

const diagramWidget = widgetBase.extend({
  _type: z.literal("diagram"),
  code: z.string().describe("Mermaid diagram source"),
  title: z.string().optional().describe("Diagram title"),
});

const mapWidget = widgetBase.extend({
  _type: z.literal("map"),
  title: z.string().optional(),
  places: jsonStringArray(z.object({
    id: z.string().optional().describe("Stable pin id; auto-generated when omitted"),
    label: z.string(),
    lat: z.number(),
    lng: z.number(),
    description: z.string().optional(),
  })).describe("Pins to show on the map"),
});

export const widgetSchema = z.discriminatedUnion("_type", [
  chartWidget,
  tableWidget,
  statWidget,
  progressWidget,
  formWidget,
  galleryWidget,
  codeWidget,
  diagramWidget,
  mapWidget,
]);

export type WidgetSpec = z.infer<typeof widgetSchema>;
export type ChartWidget = z.infer<typeof chartWidget>;
export type TableWidget = z.infer<typeof tableWidget>;
export type StatWidget = z.infer<typeof statWidget>;
export type ProgressWidget = z.infer<typeof progressWidget>;
export type FormWidget = z.infer<typeof formWidget>;
export type GalleryWidget = z.infer<typeof galleryWidget>;
export type CodeWidget = z.infer<typeof codeWidget>;
export type DiagramWidget = z.infer<typeof diagramWidget>;
export type MapWidget = z.infer<typeof mapWidget>;

export type FormField = z.infer<typeof formWidget>["fields"][number];

const FORM_FIELD_TYPES = new Set([
  "text",
  "number",
  "email",
  "select",
  "textarea",
]);

// The client renders the raw tool args, so a form's `fields` can arrive as a
// JSON string (models stringify nested arrays) or with malformed entries.
export function normalizeFormFields(input: unknown): FormField[] {
  let list: unknown = input;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry): FormField[] => {
    if (!entry || typeof entry !== "object") return [];
    const field = entry as Record<string, unknown>;
    const name = typeof field.name === "string" ? field.name : "";
    const label = typeof field.label === "string" ? field.label : name;
    const type = FORM_FIELD_TYPES.has(String(field.type))
      ? (field.type as FormField["type"])
      : "text";
    if (!name) return [];
    const options = Array.isArray(field.options)
      ? field.options.filter((option): option is string => typeof option === "string")
      : undefined;
    return [
      {
        name,
        label,
        type,
        placeholder:
          typeof field.placeholder === "string" ? field.placeholder : undefined,
        options,
      },
    ];
  });
}

// The tool definition the model sees.
export const renderWidgetTool = {
  description: "Render an interactive widget in the chat. Use for charts, tables, stats, progress bars, forms, image galleries, code snippets, mermaid diagrams, and maps. The widget renders inline in the conversation.",
  inputSchema: widgetSchema,
};
