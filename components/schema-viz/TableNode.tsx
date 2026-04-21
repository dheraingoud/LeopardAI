"use client";

import { memo, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ParsedColumn, ParsedTable, ObjectType } from "@/lib/schema-viz/types";
import type { SchemaVizTheme } from "@/lib/schema-viz/theme";

export interface TableNodeData {
  table: ParsedTable;
  isFocused: boolean;
  isNeighbor: boolean;
  isDimmed: boolean;
  theme: SchemaVizTheme;
  onFocus: (id: string) => void;
  [key: string]: unknown;
}

const ACCENT_COLORS: Record<ObjectType, string> = {
  table: "transparent",
  view: "#3b82f6",
  materialized_view: "#1d4ed8",
  procedure: "#a855f7",
  function: "#a855f7",
  trigger: "#fb923c",
  sequence: "#22c55e",
  enum: "#ec4899",
  index: "#94a3b8",
};

function ObjectTypeIcon({ type }: { type: ObjectType }) {
  const icons: Record<ObjectType, string> = {
    table: "⊞",
    view: "👁",
    materialized_view: "👁",
    procedure: "⚡",
    function: "ƒ",
    trigger: "⚡",
    sequence: "#",
    enum: "☰",
    index: "⊡",
  };
  return <span style={{ fontSize: 12, color: ACCENT_COLORS[type] }}>{icons[type]}</span>;
}

function ColumnIcon({ col, theme }: { col: ParsedColumn; theme: SchemaVizTheme }) {
  if (col.primaryKey) return <span style={{ fontSize: 10, color: "#f59e0b" }}>🔑</span>;
  if (col.identity) return <span style={{ fontSize: 10, color: "#64748b" }}>λ</span>;
  if (col.references) return <span style={{ fontSize: 10, color: "#818cf8" }}>🔗</span>;
  if (col.unique) return <span style={{ fontSize: 10, color: "#a78bfa" }}>★</span>;
  if (col.nullable) return <span style={{ fontSize: 10, color: "#555" }}>◇</span>;
  return <span style={{ fontSize: 8, color: theme.textType }}>•</span>;
}

function ColumnRow({
  col,
  tableId,
  theme,
  isFocused,
}: {
  col: ParsedColumn;
  tableId: string;
  theme: SchemaVizTheme;
  isFocused: boolean;
}) {
  const handleId = `${tableId}__${col.name}`;
  const hasFKOut = !!col.references;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 12px",
        borderBottom: `1px solid ${theme.nodeBorder}44`,
        background: isFocused && hasFKOut ? `${theme.nodeBorderNeighbor}08` : "transparent",
      }}
    >
      {isFocused && hasFKOut && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 2,
            background: theme.nodeBorderNeighbor,
          }}
        />
      )}

      <Handle
        type="target"
        position={Position.Left}
        id={`${handleId}-target`}
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          border: `1px solid ${theme.nodeBorder}`,
          background: theme.nodeHeaderBg,
          top: "50%",
          left: -4,
        }}
      />

      <div style={{ width: 14, flexShrink: 0, textAlign: "center" }}>
        <ColumnIcon col={col} theme={theme} />
      </div>

      <span
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: col.primaryKey ? theme.textPrimary : theme.textSecondary,
          fontWeight: col.primaryKey ? 600 : 400,
          fontSize: 11,
        }}
      >
        {col.name}
      </span>

      <span
        style={{
          color: theme.textType,
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          flexShrink: 0,
        }}
      >
        {col.type.length > 13 ? col.type.slice(0, 11) + "…" : col.type}
      </span>

      {col.nullable && !col.primaryKey && (
        <span style={{ color: theme.textType, fontSize: 9, flexShrink: 0 }}>?</span>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id={`${handleId}-source`}
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          border: `1px solid ${theme.nodeBorder}`,
          background: theme.nodeHeaderBg,
          top: "50%",
          right: -4,
        }}
      />
    </div>
  );
}

function TableNode({ data, id }: NodeProps<TableNodeData>) {
  const { table, isFocused, isNeighbor, isDimmed, theme, onFocus } = data;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onFocus(id);
    },
    [id, onFocus]
  );

  const borderColor = isFocused
    ? theme.nodeBorderSelected
    : isNeighbor
      ? theme.nodeBorderNeighbor
      : isDimmed
        ? theme.nodeBorderDimmed
        : theme.nodeBorder;

  const boxShadow = isFocused
    ? theme.glowSelected
    : isNeighbor
      ? theme.glowNeighbor
      : "none";

  return (
    <div
      onClick={handleClick}
      style={{
        background: theme.nodeBg,
        border: `1px solid ${borderColor}`,
        borderLeft: `3px solid ${ACCENT_COLORS[table.objectType]}`,
        boxShadow,
        opacity: isDimmed ? theme.nodeOpacityDimmed : 1,
        transition: "opacity 220ms ease, box-shadow 200ms ease, border-color 200ms ease",
        borderRadius: 10,
        overflow: "hidden",
        minWidth: 240,
        maxWidth: 320,
        fontFamily: "monospace",
        fontSize: 12,
        cursor: "pointer",
        zIndex: isFocused ? 100 : isNeighbor ? 50 : 1,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: theme.nodeHeaderBg,
          borderBottom: `1px solid ${theme.nodeBorder}`,
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <ObjectTypeIcon type={table.objectType} />
        <span
          style={{
            color: theme.textPrimary,
            fontWeight: 600,
            fontSize: 11,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {table.schema && (
            <span style={{ color: theme.textSecondary }}>{table.schema}.</span>
          )}
          {table.name}
        </span>
        {(table.triggers?.length ?? 0) > 0 && (
          <span
            style={{
              fontSize: 9,
              background: "#fb923c22",
              color: "#fb923c",
              borderRadius: 4,
              padding: "1px 5px",
            }}
          >
            ⚡{table.triggers!.length}
          </span>
        )}
      </div>

      {/* Columns for tables/views */}
      {["table", "view", "materialized_view"].includes(table.objectType) && (
        <>
          {table.columns.slice(0, 20).map((col) => (
            <ColumnRow
              key={col.name}
              col={col}
              tableId={id}
              theme={theme}
              isFocused={isFocused}
            />
          ))}
          {table.columns.length > 20 && (
            <div
              style={{
                padding: "3px 12px",
                color: theme.textType,
                fontSize: 10,
                fontStyle: "italic",
              }}
            >
              +{table.columns.length - 20} more columns
            </div>
          )}
        </>
      )}

      {/* Procedure/Function — truncated definition */}
      {["procedure", "function"].includes(table.objectType) && table.definition && (
        <div style={{ padding: "6px 12px", color: theme.textType, fontSize: 10 }}>
          <code
            style={{
              whiteSpace: "pre-wrap",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {table.definition.slice(0, 200)}
          </code>
        </div>
      )}

      {/* Enum — value badges */}
      {table.objectType === "enum" && (
        <div style={{ padding: "6px 12px", display: "flex", flexWrap: "wrap", gap: 4 }}>
          {table.columns.map((c) => (
            <span
              key={c.name}
              style={{
                fontSize: 9,
                background: theme.dotColor,
                color: theme.textSecondary,
                borderRadius: 3,
                padding: "1px 5px",
              }}
            >
              {c.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(TableNode);
