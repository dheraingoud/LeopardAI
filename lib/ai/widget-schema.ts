// Generative UI widget schema — the model emits a JSON tree, the frontend
// renders it as interactive React components. Each widget has a `_type` that
// selects the component and props inline.
import { z } from "zod";

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

const chartWidget = widgetBase.extend({
  _type: z.literal("chart"),
  chartType: z.enum(["bar", "line", "pie"]).describe("Chart type"),
  title: z.string().describe("Chart title"),
  data: jsonStringArray(z.object({
    label: z.string(),
    value: z.number(),
  })).describe("Data points"),
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

// The tool definition the model sees.
export const renderWidgetTool = {
  description: "Render an interactive widget in the chat. Use for charts, tables, stats, progress bars, forms, image galleries, code snippets, mermaid diagrams, and maps. The widget renders inline in the conversation.",
  inputSchema: widgetSchema,
};
