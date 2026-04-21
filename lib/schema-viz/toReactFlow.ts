import type { Node, Edge } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import type { ParsedSchema, ParsedTable, ParsedRelationship, ObjectType } from "./types";
import type { SchemaVizTheme } from "./theme";
import { applyDagreLayout } from "./layout";

export interface TableNodeData {
  table: ParsedTable;
  isFocused: boolean;
  isNeighbor: boolean;
  isDimmed: boolean;
  theme: SchemaVizTheme;
  onFocus: (id: string) => void;
  [key: string]: unknown;
}

export function schemaToReactFlow(
  schema: ParsedSchema,
  theme: SchemaVizTheme,
  direction: "LR" | "TB" = "LR",
  hiddenObjectTypes: Set<ObjectType>
): { nodes: Node<TableNodeData>[]; edges: Edge[] } {
  const visibleTables = schema.tables.filter(
    (t) => !hiddenObjectTypes.has(t.objectType)
  );

  const rawNodes: Node<TableNodeData>[] = visibleTables.map((table) => ({
    id: table.id,
    type: "tableNode",
    position: { x: 0, y: 0 },
    data: {
      table,
      isFocused: false,
      isNeighbor: false,
      isDimmed: false,
      theme,
      onFocus: () => {},
    },
  }));

  const edgeRefs = schema.relationships.map((r) => ({
    id: r.id,
    source: r.fromTable,
    target: r.toTable,
  }));

  const nodes = applyDagreLayout(
    rawNodes as Node[],
    edgeRefs,
    direction
  ) as Node<TableNodeData>[];

  const edges = buildEdges(schema.relationships, new Set(), false, theme);

  return { nodes, edges };
}

export function buildEdges(
  relationships: ParsedRelationship[],
  focusedEdgeIds: Set<string>,
  hasFocus: boolean,
  theme: SchemaVizTheme
): Edge[] {
  return relationships.map((rel) => {
    const isFocused = focusedEdgeIds.has(rel.id);
    const isDimmed = hasFocus && !isFocused;
    const isInferred = rel.constraintName === "(inferred)";

    return {
      id: rel.id,
      source: rel.fromTable,
      sourceHandle: `${rel.fromTable}__${rel.fromColumn}-source`,
      target: rel.toTable,
      targetHandle: `${rel.toTable}__${rel.toColumn}-target`,
      type: "smoothstep",
      animated: isFocused,
      label: isInferred ? "~" : undefined,
      labelStyle: { fontSize: 9, fill: theme.textType },
      style: {
        stroke: isDimmed
          ? "transparent"
          : isFocused
            ? theme.edgeFocused
            : theme.edgeDefault,
        strokeWidth: isFocused ? theme.edgeWidthFocused : theme.edgeWidth,
        strokeDasharray: isInferred ? "4 3" : undefined,
        transition:
          "stroke 200ms ease, stroke-width 200ms ease, opacity 200ms ease",
        filter: isFocused
          ? `drop-shadow(0 0 5px ${theme.edgeFocused})`
          : "none",
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isFocused ? theme.edgeFocused : theme.edgeDefault,
        width: 10,
        height: 10,
      },
    };
  });
}
