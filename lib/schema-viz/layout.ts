import dagre from "dagre";
import type { Node } from "@xyflow/react";
import type { ParsedTable } from "./types";

/** Estimated node dimensions must match the actual rendered TableNode sizes */
const NODE_WIDTH = 340;
const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 48;
const MAX_VISIBLE_ROWS = 20;

export function applyDagreLayout(
  nodes: Node[],
  edges: Array<{ id: string; source: string; target: string }>,
  direction: "LR" | "TB" = "LR"
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    // Generous spacing so tables never overlap and feel "tidy"
    ranksep: direction === "LR" ? 200 : 120,
    nodesep: direction === "LR" ? 80 : 140,
    edgesep: 40,
    marginx: 80,
    marginy: 80,
  });

  for (const node of nodes) {
    const cols = (node.data?.table as ParsedTable | undefined)?.columns?.length ?? 5;
    const visibleCols = Math.min(cols, MAX_VISIBLE_ROWS);
    const estimatedHeight = HEADER_HEIGHT + visibleCols * ROW_HEIGHT + (cols > MAX_VISIBLE_ROWS ? 28 : 0);
    g.setNode(node.id, { width: NODE_WIDTH, height: estimatedHeight });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    if (!pos) return node;
    return {
      ...node,
      position: {
        x: pos.x - (pos.width ?? NODE_WIDTH) / 2,
        y: pos.y - (pos.height ?? 100) / 2,
      },
    };
  });
}
