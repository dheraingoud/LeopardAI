"use client";

import type { ParsedTable, ParsedRelationship, ObjectType } from "@/lib/schema-viz/types";
import type { SchemaVizTheme } from "@/lib/schema-viz/theme";
import { ACCENT_COLORS, ObjectTypeIcon } from "./TableNode";

interface InspectorPanelProps {
  table: ParsedTable;
  relationships: ParsedRelationship[];
  theme: SchemaVizTheme;
  onClose: () => void;
  onFocusTable: (id: string) => void;
  onAskAI: (table: ParsedTable) => void;
}

function SectionHeader({ label, theme }: { label: string; theme: SchemaVizTheme }) {
  return (
    <div
      style={{
        padding: "8px 14px 4px",
        fontSize: 9,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: theme.textType,
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  );
}

function ColumnIcon({ col, theme }: { col: { primaryKey: boolean; identity: boolean; references?: { table: string }; unique: boolean; nullable: boolean }; theme: SchemaVizTheme }) {
  if (col.primaryKey) return <span style={{ fontSize: 10, color: "#f59e0b" }}>🔑</span>;
  if (col.identity) return <span style={{ fontSize: 10, color: "#64748b" }}>λ</span>;
  if (col.references) return <span style={{ fontSize: 10, color: "#818cf8" }}>🔗</span>;
  if (col.unique) return <span style={{ fontSize: 10, color: "#a78bfa" }}>★</span>;
  if (col.nullable) return <span style={{ fontSize: 10, color: "#555" }}>◇</span>;
  return <span style={{ fontSize: 8, color: theme.textType }}>•</span>;
}

export function InspectorPanel({
  table,
  relationships,
  theme,
  onClose,
  onFocusTable,
  onAskAI,
}: InspectorPanelProps) {
  const connected = relationships.filter(
    (r) => r.fromTable === table.id || r.toTable === table.id
  );

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 320,
        background: theme.controlsBg,
        borderLeft: `1px solid ${theme.controlsBorder}`,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        transform: "translateX(0)",
        animation: "slideInRight 220ms ease",
        fontFamily: "monospace",
        fontSize: 12,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 14px",
          borderBottom: `1px solid ${theme.controlsBorder}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <ObjectTypeIcon type={table.objectType} />
        <span style={{ color: theme.textPrimary, fontWeight: 600, flex: 1 }}>
          {table.name}
        </span>
        <button
          onClick={onClose}
          style={{
            color: theme.textType,
            fontSize: 16,
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
        {/* Type badge */}
        <div style={{ padding: "0 14px 10px", color: theme.textType }}>
          {table.objectType.replace(/_/g, " ")}
          {table.schema && ` · ${table.schema}`}
          {table.comment && (
            <div style={{ marginTop: 4, color: theme.textSecondary, fontStyle: "italic" }}>
              {table.comment}
            </div>
          )}
        </div>

        {/* Columns */}
        <SectionHeader label={`Columns (${table.columns.length})`} theme={theme} />
        {table.columns.map((col) => (
          <div
            key={col.name}
            style={{
              padding: "4px 14px",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <ColumnIcon col={col} theme={theme} />
            <span
              style={{
                color: col.primaryKey ? theme.textPrimary : theme.textSecondary,
                flex: 1,
              }}
            >
              {col.name}
            </span>
            <span style={{ color: theme.textType, fontSize: 9 }}>{col.type}</span>
            {col.nullable && (
              <span style={{ color: theme.textType, fontSize: 9 }}>?</span>
            )}
          </div>
        ))}

        {/* Indexes */}
        {table.indexes.length > 0 && (
          <>
            <SectionHeader label={`Indexes (${table.indexes.length})`} theme={theme} />
            {table.indexes.map((idx) => (
              <div
                key={idx.name}
                style={{ padding: "3px 14px", color: theme.textSecondary }}
              >
                {idx.name}{" "}
                {idx.unique && (
                  <span style={{ color: "#a78bfa", fontSize: 9 }}>unique</span>
                )}
              </div>
            ))}
          </>
        )}

        {/* Connected tables */}
        {connected.length > 0 && (
          <>
            <SectionHeader label={`Connected (${connected.length})`} theme={theme} />
            {connected.map((rel) => {
              const isOutgoing = rel.fromTable === table.id;
              const otherTable = isOutgoing ? rel.toTable : rel.fromTable;
              return (
                <div
                  key={rel.id}
                  style={{
                    padding: "5px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ color: theme.textType }}>
                    {isOutgoing ? "→" : "←"}
                  </span>
                  <span style={{ color: theme.textSecondary, flex: 1 }}>
                    {otherTable}
                  </span>
                  <button
                    onClick={() => onFocusTable(otherTable)}
                    style={{
                      fontSize: 9,
                      color: theme.edgeFocused,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Go
                  </button>
                </div>
              );
            })}
          </>
        )}

        {/* Triggers */}
        {(table.triggers?.length ?? 0) > 0 && (
          <>
            <SectionHeader
              label={`Triggers (${table.triggers!.length})`}
              theme={theme}
            />
            {table.triggers!.map((t) => (
              <div
                key={t.name}
                style={{ padding: "3px 14px", color: theme.textSecondary }}
              >
                {t.name} · {t.timing} {t.event}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Ask AI button */}
      <div
        style={{
          padding: "10px 14px",
          borderTop: `1px solid ${theme.controlsBorder}`,
        }}
      >
        <button
          onClick={() => onAskAI(table)}
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: 8,
            background: "#6366f1",
            color: "#fff",
            border: "none",
            fontSize: 11,
            cursor: "pointer",
            fontFamily: "monospace",
          }}
        >
          Ask AI about this table ↗
        </button>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(320px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
