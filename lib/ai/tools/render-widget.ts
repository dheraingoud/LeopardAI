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
    // Identity execute — the widget spec IS the output. The client renders
    // the tool-call args as an interactive component. Without execute the SDK
    // would throw MissingToolResultsError on every later prompt.
    execute: async (args) => args,
  });
}
