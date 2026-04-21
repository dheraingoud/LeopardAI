import dagre from "dagre";
import type { Node } from "@xyflow/react";
import type { ParsedTable } from "./types";

export function applyDagreLayout(
  nodes: Node[],
  edges: Array<{ id: string; source: string; target: string }>,
  direction: "LR" | "TB" = "LR"
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    ranksep: direction === "LR" ? 120 : 60,
    nodesep: direction === "LR" ? 40 : 100,
    edgesep: 20,
    marginx: 60,
    marginy: 60,
  });

  for (const node of nodes) {
    const cols = (node.data?.table as ParsedTable | undefined)?.columns?.length ?? 5;
    g.setNode(node.id, { width: 268, height: 44 + Math.min(cols, 20) * 29 });
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
        x: pos.x - (pos.width ?? 268) / 2,
        y: pos.y - (pos.height ?? 100) / 2,
      },
    };
  });
}
