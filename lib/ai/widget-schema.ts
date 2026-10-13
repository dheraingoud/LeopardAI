// Generative UI widget schema — the model emits a JSON tree, the frontend
// renders it as interactive React components. Each widget has a `_type` that
// selects the component and props inline.
import { z } from "zod";

const widgetBase = z.object({
  _type: z.string().describe("Widget type: chart, table, stat, progress, form, gallery, code"),
});

const chartWidget = widgetBase.extend({
  _type: z.literal("chart"),
  chartType: z.enum(["bar", "line", "pie"]).describe("Chart type"),
  title: z.string().describe("Chart title"),
  data: z.array(z.object({
    label: z.string(),
    value: z.number(),
  })).describe("Data points"),
});

const tableWidget = widgetBase.extend({
  _type: z.literal("table"),
  title: z.string().optional().describe("Table title"),
  columns: z.array(z.string()).describe("Column headers"),
  rows: z.array(z.array(z.union([z.string(), z.number()]))).describe("Row data"),
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
  fields: z.array(z.object({
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
  images: z.array(z.object({
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

export const widgetSchema = z.discriminatedUnion("_type", [
  chartWidget,
  tableWidget,
  statWidget,
  progressWidget,
  formWidget,
  galleryWidget,
  codeWidget,
]);

export type WidgetSpec = z.infer<typeof widgetSchema>;
export type ChartWidget = z.infer<typeof chartWidget>;
export type TableWidget = z.infer<typeof tableWidget>;
export type StatWidget = z.infer<typeof statWidget>;
export type ProgressWidget = z.infer<typeof progressWidget>;
export type FormWidget = z.infer<typeof formWidget>;
export type GalleryWidget = z.infer<typeof galleryWidget>;
export type CodeWidget = z.infer<typeof codeWidget>;

// The tool definition the model sees.
export const renderWidgetTool = {
  description: "Render an interactive widget in the chat. Use for charts, tables, stats, progress bars, forms, image galleries, and code snippets. The widget renders inline in the conversation.",
  inputSchema: widgetSchema,
};
