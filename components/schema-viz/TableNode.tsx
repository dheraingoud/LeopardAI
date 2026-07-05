"use client";

import { memo, useCallback, useState } from "react";
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
  onHover?: (id: string | null) => void;
}

export const ACCENT_COLORS: Record<ObjectType, string> = {
  table: "#3b82f6",
  view: "#06b6d4",
  materialized_view: "#0891b2",
  procedure: "#a855f7",
  function: "#8b5cf6",
  trigger: "#fb923c",
  sequence: "#22c55e",
  enum: "#ec4899",
  index: "#94a3b8",
};

export function ObjectTypeIcon({ type }: { type: ObjectType }) {
  const icons: Record<ObjectType, string> = {
    table: "⊞", view: "👁", materialized_view: "👁",
    procedure: "⚡", function: "ƒ", trigger: "⚡",
    sequence: "#", enum: "☰", index: "⊡",
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

function ColumnRow({ col, tableId, theme, isFocused }: {
  col: ParsedColumn; tableId: string; theme: SchemaVizTheme; isFocused: boolean;
}) {
  const handleId = `${tableId}__${col.name}`;
  const hasFKOut = !!col.references;

  return (
    <div style={{
      position: "relative", display: "flex", alignItems: "center", gap: 8,
      padding: "4px 12px", borderBottom: `1px solid ${theme.nodeBorder}44`,
      background: isFocused && hasFKOut ? `${theme.nodeBorderNeighbor}08` : "transparent",
    }}>
      {isFocused && hasFKOut && (
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: theme.nodeBorderNeighbor }} />
      )}
      <Handle type="target" position={Position.Left} id={`${handleId}-target`}
        style={{ width: 6, height: 6, borderRadius: "50%", border: `1px solid ${theme.nodeBorder}`, background: theme.nodeHeaderBg, top: "50%", left: -4 }} />
      <div style={{ width: 14, flexShrink: 0, textAlign: "center" }}>
        <ColumnIcon col={col} theme={theme} />
      </div>
      <span style={{
        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        color: col.primaryKey ? theme.textPrimary : theme.textSecondary,
        fontWeight: col.primaryKey ? 600 : 400, fontSize: 12,
      }}>{col.name}</span>
      <span style={{
        color: theme.textType, fontSize: 10, textTransform: "uppercase",
        letterSpacing: "0.05em", flexShrink: 0,
      }}>{col.type.length > 20 ? col.type.slice(0, 18) + "…" : col.type}</span>
      {col.nullable && !col.primaryKey && (
        <span style={{ color: theme.textType, fontSize: 10, flexShrink: 0 }}>?</span>
      )}
      <Handle type="source" position={Position.Right} id={`${handleId}-source`}
        style={{ width: 6, height: 6, borderRadius: "50%", border: `1px solid ${theme.nodeBorder}`, background: theme.nodeHeaderBg, top: "50%", right: -4 }} />
    </div>
  );
}

function TableNodeInner({ data, id }: { data: TableNodeData; id: string }) {
  const { table, isFocused, isNeighbor, isDimmed, theme, onFocus, onHover } = data;
  const handleClick = useCallback((e: React.MouseEvent) => { e.stopPropagation(); onFocus(id); }, [id, onFocus]);
  
  const [isHovered, setIsHovered] = useState(false);
  const handleMouseEnter = useCallback(() => { setIsHovered(true); onHover?.(id); }, [id, onHover]);
  const handleMouseLeave = useCallback(() => { setIsHovered(false); onHover?.(null); }, [onHover]);

  const borderColor = isHovered || isFocused ? theme.nodeBorderSelected : isNeighbor ? theme.nodeBorderNeighbor : isDimmed ? theme.nodeBorderDimmed : theme.nodeBorder;
  const boxShadow = isHovered || isFocused ? theme.glowSelected : isNeighbor ? theme.glowNeighbor : "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
  const accentColor = ACCENT_COLORS[table.objectType] || "transparent";

  return (
    <div 
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        background: theme.nodeBg, border: `1px solid ${borderColor}`,
        boxShadow, opacity: isDimmed && !isHovered ? theme.nodeOpacityDimmed : 1,
        transition: "opacity 150ms ease, box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease",
        transform: isHovered ? "translateY(-2px)" : "translateY(0)",
        borderRadius: 10, overflow: "hidden", minWidth: 300, maxWidth: 450,
        fontFamily: "monospace", fontSize: 13, cursor: "pointer",
        zIndex: isHovered || isFocused ? 100 : isNeighbor ? 50 : 1,
      }}>
      <div style={{
        background: `${accentColor}0a`,
        borderBottom: `2px solid ${accentColor}`,
        padding: "10px 14px", display: "flex", alignItems: "center", gap: 8,
      }}>
        <ObjectTypeIcon type={table.objectType} />
        <span style={{
          color: theme.textPrimary, fontWeight: 700, fontSize: 13, flex: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {table.schema && <span style={{ color: theme.textSecondary, fontWeight: 500 }}>{table.schema}.</span>}
          {table.name}
        </span>
        {(table.triggers?.length ?? 0) > 0 && (
          <span style={{ fontSize: 9, background: "#fb923c22", color: "#fb923c", borderRadius: 4, padding: "1px 5px" }}>
            ⚡{table.triggers!.length}
          </span>
        )}
      </div>

      {["table", "view", "materialized_view"].includes(table.objectType) && (
        <>
          {table.columns.slice(0, 20).map((col: ParsedColumn) => (
            <ColumnRow key={col.name} col={col} tableId={id} theme={theme} isFocused={isFocused} />
          ))}
          {table.columns.length > 20 && (
            <div style={{ padding: "4px 12px", color: theme.textType, fontSize: 11, fontStyle: "italic", textAlign: "center" }}>
              +{table.columns.length - 20} more columns
            </div>
          )}
        </>
      )}

      {["procedure", "function"].includes(table.objectType) && table.definition && (
        <div style={{ padding: "6px 12px", color: theme.textType, fontSize: 10 }}>
          <code style={{
            whiteSpace: "pre-wrap", display: "-webkit-box",
            WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{table.definition.slice(0, 200)}</code>
        </div>
      )}

      {table.objectType === "enum" && (
        <div style={{ padding: "6px 12px", display: "flex", flexWrap: "wrap", gap: 4 }}>
          {table.columns.map((c: ParsedColumn) => (
            <span key={c.name} style={{
              fontSize: 9, background: theme.dotColor, color: theme.textSecondary,
              borderRadius: 3, padding: "1px 5px",
            }}>{c.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Use NodeProps from @xyflow/react with Record<string, unknown> for compatibility
function TableNode(props: NodeProps) {
  const data = props.data as unknown as TableNodeData;
  return <TableNodeInner data={data} id={props.id} />;
}

export default memo(TableNode);
