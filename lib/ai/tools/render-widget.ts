// renderWidget — the generative UI tool. The model emits a widget spec
// (chart, table, stat, progress, form, gallery, code) and the frontend renders
// it as an interactive React component inline in the chat. No approval gate —
// rendering is read-only, not a side effect.
import { tool } from "ai";
import { widgetSchema } from "@/lib/ai/widget-schema";

export function renderWidget() {
  return tool({
    description:
      "Render an interactive widget inline in the chat. Pick the type that fits the data:\n" +
      "- chart: numeric series — chartType bar (comparisons), line (trend over time/sequence), pie (share of a whole, values must sum meaningfully)\n" +
      "- table: rows × columns of mixed values; sorted views\n" +
      "- stat: one big number with a label; use change/trend for deltas\n" +
      "- progress: 0-100 completion of one thing\n" +
      "- gallery: images the user should browse (needs real image URLs)\n" +
      "- code: a snippet worth its own card (language + code)\n" +
      "- diagram: mermaid source for flows/architecture/sequences\n" +
      "- map: geographic places with lat/lng pins\n" +
      "- form: collect several structured answers at once\n" +
      "Rules: always pass arrays as real JSON arrays (never stringified); ids are optional (auto-filled); prefer one well-chosen widget over several; keep titles short.",
    inputSchema: widgetSchema,
    // Identity execute — the widget spec IS the output. The client renders
    // the tool-call args as an interactive component. Without execute the SDK
    // would throw MissingToolResultsError on every later prompt.
    execute: async (args) => args,
  });
}
