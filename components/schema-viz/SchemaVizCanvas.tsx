"use client";

import { useCallback, useMemo, useEffect, useState } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Panel,
  ReactFlowProvider,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { ParsedSchema, ParsedRelationship } from "@/lib/schema-viz/types";
import { useSchemaVizStore } from "@/store/schemaVizStore";
import { schemaToReactFlow, buildEdges } from "@/lib/schema-viz/toReactFlow";
import type { TableNodeData } from "@/lib/schema-viz/toReactFlow";
import TableNodeComponent from "./TableNode";
import { InspectorPanel } from "./InspectorPanel";
import { SchemaVizToolbar, StatsBar } from "./Toolbar";

const NODE_TYPES = { tableNode: TableNodeComponent } as const;

function SchemaVizInner({ schema }: { schema: ParsedSchema }) {
  const store = useSchemaVizStore();
  const {
    focusedTableId,
    neighborIds,
    focusedEdgeIds,
    theme,
    hiddenObjectTypes,
    layoutDirection,
    setFocusedTable,
  } = store;
  const { setViewport, fitView } = useReactFlow();
  const hasFocus = focusedTableId !== null;

  // Build initial nodes/edges from schema
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => schemaToReactFlow(schema, theme, layoutDirection, hiddenObjectTypes),
    [schema, theme, layoutDirection, hiddenObjectTypes]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Re-layout when schema/direction/filters change, then fit to view
  useEffect(() => {
    setNodes(initialNodes as Node[]);
    // After nodes update, schedule a fitView so the user always sees everything
    requestAnimationFrame(() => {
      fitView({ padding: 0.15, duration: 300 });
    });
  }, [initialNodes, setNodes, fitView]);

  // Sync focus state into node data without recreating nodes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        zIndex: n.id === focusedTableId ? 100 : neighborIds.has(n.id) ? 50 : 1,
        data: {
          ...n.data,
          isFocused: n.id === focusedTableId,
          isNeighbor: neighborIds.has(n.id),
          isDimmed: hasFocus && n.id !== focusedTableId && !neighborIds.has(n.id),
          theme,
          onFocus: (id: string) => {
            if (focusedTableId === id) {
              setFocusedTable(null, schema.relationships);
            } else {
              setFocusedTable(id, schema.relationships);
              const node = nds.find((nd) => nd.id === id);
              if (node) {
                setViewport(
                  {
                    x: -(node.position.x - window.innerWidth / 2 + 170),
                    y: -(node.position.y - window.innerHeight / 2 + 120),
                    zoom: 1.0,
                  },
                  { duration: 400 }
                );
              }
            }
          },
        },
      }))
    );
  }, [focusedTableId, neighborIds, hasFocus, theme, setFocusedTable, schema.relationships, setViewport, setNodes]);

  // Sync edge styles
  useEffect(() => {
    setEdges(buildEdges(schema.relationships, focusedEdgeIds, hasFocus, theme));
  }, [schema.relationships, focusedEdgeIds, hasFocus, theme, setEdges]);

  const onPaneClick = useCallback(() => {
    setFocusedTable(null, schema.relationships);
  }, [setFocusedTable, schema.relationships]);

  const focusedTable = useMemo(
    () =>
      focusedTableId
        ? schema.tables.find((t) => t.id === focusedTableId) ?? null
        : null,
    [focusedTableId, schema.tables]
  );

  const [askAITable, setAskAITable] = useState<ParsedSchema["tables"][0] | null>(null);

  // Keyboard shortcut: press "0" or "Home" to reset the view
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "0" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        fitView({ padding: 0.15, duration: 300 });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fitView]);

  return (
    <div className="w-full h-full relative" style={{ background: theme.canvasBg }}>
      {/* Dim overlay for focus mode */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 5,
          background: hasFocus
            ? theme.id === "dark"
              ? "rgba(0,0,0,0.22)"
              : "rgba(255,255,255,0.28)"
            : "transparent",
          transition: "background 280ms ease",
        }}
      />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
        defaultViewport={{ x: 0, y: 0, zoom: 0.85 }}
        minZoom={0.05}
        maxZoom={3.0}
        /* ---- Zoom & Pan tuning ---- */
        zoomOnScroll={true}
        panOnScroll={false}
        panOnDrag={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={true}
        selectionOnDrag={false}
        /* Increase scroll-wheel zoom sensitivity (default ~0.5, higher = snappier) */
        zoomActivationKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color={theme.dotColor}
        />
        <Controls
          showZoom
          showFitView
          showInteractive={false}
          style={{
            background: theme.controlsBg,
            border: `1px solid ${theme.controlsBorder}`,
            borderRadius: 10,
          }}
        />
        <MiniMap
          nodeColor={(n) => {
            if (n.data?.isFocused) return "#f59e0b";
            if (n.data?.isNeighbor) return "#6366f1";
            if (n.data?.isDimmed) return theme.id === "dark" ? "#1e1e1e" : "#e5e7eb";
            return theme.id === "dark" ? "#2a2a2a" : "#e2e8f0";
          }}
          maskColor={theme.minimapMask}
          style={{
            background: theme.minimapBg,
            border: `1px solid ${theme.controlsBorder}`,
            borderRadius: 10,
          }}
        />
        <Panel position="top-left" style={{ margin: 10 }}>
          <SchemaVizToolbar schema={schema} theme={theme} />
        </Panel>
        <Panel position="bottom-center" style={{ marginBottom: 10 }}>
          <StatsBar schema={schema} theme={theme} />
        </Panel>
      </ReactFlow>

      {/* Inspector panel — slides in from right */}
      {focusedTable && (
        <InspectorPanel
          table={focusedTable}
          relationships={schema.relationships}
          theme={theme}
          onClose={() => setFocusedTable(null, schema.relationships)}
          onFocusTable={(id) => setFocusedTable(id, schema.relationships)}
          onAskAI={(table) => {
            setAskAITable(table);
          }}
        />
      )}
    </div>
  );
}

export default function SchemaViz({ schema }: { schema: ParsedSchema }) {
  return (
    <ReactFlowProvider>
      <SchemaVizInner schema={schema} />
    </ReactFlowProvider>
  );
}
