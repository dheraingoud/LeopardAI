// renderWidget — the generative UI tool. The model emits a widget spec
// (chart, table, stat, progress, form, gallery, code) and the frontend renders
// it as an interactive React component inline in the chat. No approval gate —
// rendering is read-only, not a side effect.
import { tool } from "ai";
import { widgetSchema } from "@/lib/ai/widget-schema";

const itemCount = (args: Record<string, unknown>): number | null => {
  const list = (value: unknown): number =>
    Array.isArray(value) ? value.length : 0;
  switch (args._type) {
    case "chart":
      if (Array.isArray(args.data)) return list(args.data);
      if (Array.isArray(args.series)) return list(args.series);
      if (Array.isArray(args.scatter)) return list(args.scatter);
      if (Array.isArray(args.bins)) return list(args.bins);
      if (Array.isArray(args.groups)) return list(args.groups);
      return null;
    case "table":
      return list(args.rows);
    case "gallery":
      return list(args.images);
    case "form":
      return list(args.fields);
    case "map":
      return list(args.places);
    default:
      return null;
  }
};

const widgetResult = (args: Record<string, unknown>): string => {
  const type = String(args?._type ?? "widget");
  const title = typeof args?.title === "string" ? args.title.trim() : "";
  const label = typeof args?.label === "string" ? args.label.trim() : "";
  const name = title || label;
  const count = itemCount(args);
  const noun =
    type === "table" ? "row" : type === "gallery" ? "image" : type === "form" ? "field" : type === "map" ? "place" : "point";
  const detail = count === null ? "" : ` with ${count} ${noun}${count === 1 ? "" : "s"}`;
  const named = name ? ` "${name}"` : "";
  return (
    `Rendered ${type} widget${named}${detail}. The widget is now visible in the ` +
    `chat. Do not call renderWidget again for this widget — reply to the user ` +
    `in text instead.`
  );
};

export function renderWidget() {
  return tool({
    description:
      "Render an interactive widget inline in the chat. Pick the type that fits the data:\n" +
      "- chart: numeric series. chartType bar (horizontal comparisons), column (vertical comparisons), line (trend over time/sequence), area (trend with volume), pie (share of a whole, values must sum meaningfully), donut (share of a whole, ring), sparkline (inline micro trend), histogram (distribution of one numeric sample), heatmap (row × column grid), scatter (x/y relationship), grouped-bar (compare series per category), stacked-bar (part-to-whole per category), stacked-area (part-to-whole over time). Also available: lollipop, dot-plot, leaderboard, radial-bar, polar-area, waffle, funnel, diverging-bar, split-bar, sparkbar, win-loss, horizon, beeswarm, streamgraph, bump, ridgeline, strip-plot, connected-scatter, hexbin, contour, quadrant, gauge, progress-ring.\n" +
      "  Data goes in `data` for the point-driven forms; `series` + `groups` for grouped-bar/stacked-bar/stacked-area/streamgraph; `groups` alone for ridgeline/strip-plot; `matrix` for heatmap; `scatter` for scatter/connected-scatter/hexbin/contour/quadrant; `bins` for histogram; `value` for gauge/progress-ring; `xLabel` and `yLabel` name the axes.\n" +
      "  Forms with no simple field — sankey, network, arc-diagram, treemap, sunburst, icicle, circle-packing, tree, gantt, waterfall, radar, parallel-coordinates, venn, upset, chord, dendrogram, bullet, box-plot, violin, population-pyramid, candlestick, slope, range-bar, dumbbell, difference-area, mirrored-area, marimekko, choropleth, symbol-map, dot-map, flow-map, diverging-stacked — carry a `spec` payload instead: `{ type, v: \"dg/1\", ...props }`, which replaces the simple fields.\n" +
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
    // Execute returns a short confirmation, not the spec. The client renders
    // the tool-call ARGS as the interactive component; the result is what the
    // model reads next. Echoing the spec back made the model re-call the
    // tool with the same args (six identical renders in one turn) because
    // nothing told it the widget was already on screen.
    execute: async (args) => widgetResult(args as Record<string, unknown>),
  });
}
