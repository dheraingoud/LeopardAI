// renderWidget — the generative UI tool. The model emits a widget spec
// (chart, table, stat, progress, form, gallery, code) and the frontend renders
// it as an interactive React component inline in the chat. No approval gate —
// rendering is read-only, not a side effect.
import { tool } from "ai";
import { widgetSchema } from "@/lib/ai/widget-schema";

export function renderWidget() {
  return tool({
    description:
      "Render an interactive widget in the chat. Use for charts, tables, stats, progress bars, forms, image galleries, and code snippets. The widget renders inline in the conversation. Call this when the user asks for data visualization, comparisons, dashboards, or any structured data display.",
    inputSchema: widgetSchema,
    // Identity execute — the widget spec IS the output. The client renders
    // the tool-call args as an interactive component. Without execute the SDK
    // would throw MissingToolResultsError on every later prompt.
    execute: async (args) => args,
  });
}
