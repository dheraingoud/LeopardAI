"use client";

import { useMemo } from "react";
import type { ParsedTable, ParsedRelationship, ParsedColumn, ObjectType } from "@/lib/schema-viz/types";
import type { SchemaVizTheme } from "@/lib/schema-viz/theme";
import { ACCENT_COLORS } from "./TableNode";

function ObjectTypeIcon({ type }: { type: ObjectType }) {
  const icons: Record<ObjectType, string> = {
    table: "⊞", view: "👁", materialized_view: "👁",
    procedure: "⚡", function: "ƒ", trigger: "⚡",
    sequence: "#", enum: "☰", index: "⊡",
  };
  return <span style={{ fontSize: 13, color: ACCENT_COLORS[type] }}>{icons[type]}</span>;
}

interface InspectorPanelProps {
  table: ParsedTable;
  relationships: ParsedRelationship[];
  theme: SchemaVizTheme;
  onClose: () => void;
  onFocusTable: (id: string) => void;
  onAskAI: (table: ParsedTable) => void;
}

function SectionHeader({ label, theme, count }: { label: string; theme: SchemaVizTheme; count?: number }) {
  return (
    <div
      style={{
        padding: "10px 14px 5px",
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: theme.textType,
        fontWeight: 700,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>{label}</span>
      {typeof count === "number" && (
        <span style={{ background: theme.nodeBorder, color: theme.textSecondary, borderRadius: 4, padding: "1px 6px", fontSize: 9 }}>{count}</span>
      )}
    </div>
  );
}

function ColumnIcon({ col, theme }: { col: { primaryKey: boolean; identity: boolean; references?: { table: string }; unique: boolean; nullable: boolean }; theme: SchemaVizTheme }) {
  if (col.primaryKey) return <span style={{ fontSize: 10, color: "#f59e0b" }}>🔑</span>;
  if (col.identity) return <span style={{ fontSize: 10, color: "#64748b" }}>λ</span>;
  if (col.references) return <span style={{ fontSize: 10, color: "#818cf8" }}>🔗</span>;
  if (col.unique) return <span style={{ fontSize: 10, color: "#a78bfa" }}>★</span>;
  if (col.nullable) return <span style={{ fontSize: 10, color: theme.textType }}>◇</span>;
  return <span style={{ fontSize: 8, color: theme.textType }}>•</span>;
}

// ─── DB Engineer Analytics ───
function analyzeTable(table: ParsedTable, relationships: ParsedRelationship[]) {
  const pks = table.columns.filter(c => c.primaryKey);
  const fks = table.columns.filter(c => !!c.references);
  const nullableFKs = fks.filter(c => c.nullable);
  const unindexedFKs = fks.filter(fk => {
    return !table.indexes.some(idx => idx.columns.some(ic => ic === fk.name));
  });
  const wideCols = table.columns.filter(c =>
    /text|json|xml|blob|clob|bytea/i.test(c.type)
  );
  const hasNoPK = pks.length === 0 && ["table"].includes(table.objectType);
  const hasTimestamps = table.columns.some(c =>
    /created|updated|inserted|modified/i.test(c.name)
  );
  const connectedRels = relationships.filter(r => r.fromTable === table.id || r.toTable === table.id);
  const isOrphan = connectedRels.length === 0 && table.objectType === "table";
  const hasCompositePK = pks.length > 1;

  const warnings: string[] = [];
  const tips: string[] = [];

  if (hasNoPK) warnings.push("No primary key defined — consider adding one for data integrity.");
  if (nullableFKs.length > 0) warnings.push(`${nullableFKs.length} nullable FK(s) — may cause orphaned references.`);
  if (unindexedFKs.length > 0) warnings.push(`${unindexedFKs.length} FK(s) without indexes — JOINs will be slow.`);
  if (isOrphan) warnings.push("Orphan table — no foreign key relationships detected.");
  if (wideCols.length > 3) warnings.push(`${wideCols.length} wide columns (TEXT/JSON/BLOB) — consider normalization.`);

  if (hasCompositePK) tips.push("Composite PK detected — ensure JOIN queries reference all PK columns.");
  if (hasTimestamps) tips.push("Has timestamp columns — good for audit trails and change tracking.");
  if (table.columns.length > 30) tips.push(`${table.columns.length} columns — consider vertical partitioning for performance.`);
  if (fks.length > 5) tips.push(`${fks.length} foreign keys — this is a hub table, check for N+1 query patterns.`);

  return { pks, fks, nullableFKs, unindexedFKs, wideCols, warnings, tips, connectedRels };
}

export function InspectorPanel({
  table,
  relationships,
  theme,
  onClose,
  onFocusTable,
  onAskAI,
}: InspectorPanelProps) {
  const analysis = useMemo(() => analyzeTable(table, relationships), [table, relationships]);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 340,
        background: theme.controlsBg,
        borderLeft: `1px solid ${theme.controlsBorder}`,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        transform: "translateX(0)",
        animation: "slideInRight 200ms ease",
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
        <span style={{ color: theme.textPrimary, fontWeight: 700, fontSize: 13, flex: 1 }}>
          {table.schema && <span style={{ color: theme.textType, fontWeight: 400 }}>{table.schema}.</span>}
          {table.name}
        </span>
        <button
          onClick={onClose}
          style={{
            color: theme.textType,
            fontSize: 18,
            background: "none",
            border: "none",
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {/* Type badge */}
        <div style={{ padding: "2px 14px 10px", color: theme.textType, fontSize: 11 }}>
          {table.objectType.replace(/_/g, " ")}
          {table.schema && ` · ${table.schema}`}
          {table.comment && (
            <div style={{ marginTop: 4, color: theme.textSecondary, fontStyle: "italic" }}>
              {table.comment}
            </div>
          )}
        </div>

        {/* ─── DB Engineer Diagnostics ─── */}
        {analysis.warnings.length > 0 && (
          <>
            <SectionHeader label="⚠ Issues" theme={theme} count={analysis.warnings.length} />
            <div style={{ padding: "2px 14px 8px" }}>
              {analysis.warnings.map((w, i) => (
                <div key={i} style={{ padding: "3px 0", color: "#f59e0b", fontSize: 11, display: "flex", gap: 6 }}>
                  <span style={{ flexShrink: 0 }}>•</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {analysis.tips.length > 0 && (
          <>
            <SectionHeader label="💡 Tips" theme={theme} count={analysis.tips.length} />
            <div style={{ padding: "2px 14px 8px" }}>
              {analysis.tips.map((t, i) => (
                <div key={i} style={{ padding: "3px 0", color: "#818cf8", fontSize: 11, display: "flex", gap: 6 }}>
                  <span style={{ flexShrink: 0 }}>•</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Columns */}
        <SectionHeader label="Columns" theme={theme} count={table.columns.length} />
        {table.columns.map((col) => (
          <div
            key={col.name}
            style={{
              padding: "4px 14px",
              display: "flex",
              gap: 8,
              alignItems: "center",
              borderBottom: `1px solid ${theme.nodeBorder}22`,
            }}
          >
            <ColumnIcon col={col} theme={theme} />
            <span
              style={{
                color: col.primaryKey ? theme.textPrimary : theme.textSecondary,
                fontWeight: col.primaryKey ? 600 : 400,
                flex: 1,
                fontSize: 12,
              }}
            >
              {col.name}
            </span>
            <span style={{ color: theme.textType, fontSize: 10 }}>{col.type}</span>
            {col.nullable && !col.primaryKey && (
              <span style={{ color: theme.textType, fontSize: 9, opacity: 0.7 }}>NULL</span>
            )}
          </div>
        ))}

        {/* Indexes */}
        {table.indexes.length > 0 && (
          <>
            <SectionHeader label="Indexes" theme={theme} count={table.indexes.length} />
            {table.indexes.map((idx) => (
              <div
                key={idx.name}
                style={{ padding: "4px 14px", color: theme.textSecondary, display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}
              >
                <span style={{ color: "#94a3b8", fontSize: 10 }}>⊡</span>
                <span style={{ flex: 1 }}>{idx.name}</span>
                {idx.unique && (
                  <span style={{ color: "#a78bfa", fontSize: 9, background: "#a78bfa18", borderRadius: 3, padding: "1px 4px" }}>UNIQUE</span>
                )}
              </div>
            ))}
          </>
        )}

        {/* Connected tables */}
        {analysis.connectedRels.length > 0 && (
          <>
            <SectionHeader label="Relationships" theme={theme} count={analysis.connectedRels.length} />
            {analysis.connectedRels.map((rel) => {
              const isOutgoing = rel.fromTable === table.id;
              const otherTable = isOutgoing ? rel.toTable : rel.fromTable;
              const fromCol = isOutgoing ? rel.fromColumn : rel.toColumn;
              const toCol = isOutgoing ? rel.toColumn : rel.fromColumn;
              return (
                <div
                  key={rel.id}
                  style={{
                    padding: "5px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: isOutgoing ? "#22c55e" : "#f97316", fontSize: 10 }}>
                    {isOutgoing ? "→" : "←"}
                  </span>
                  <span style={{ color: theme.textSecondary, flex: 1 }}>
                    <span style={{ color: theme.textType, fontSize: 10 }}>{fromCol}</span>
                    {" → "}
                    <span style={{ fontWeight: 500 }}>{otherTable}</span>
                    <span style={{ color: theme.textType, fontSize: 10 }}>.{toCol}</span>
                  </span>
                  <button
                    onClick={() => onFocusTable(otherTable)}
                    style={{
                      fontSize: 9,
                      color: theme.edgeFocused,
                      background: `${theme.edgeFocused}12`,
                      border: `1px solid ${theme.edgeFocused}30`,
                      borderRadius: 4,
                      padding: "2px 6px",
                      cursor: "pointer",
                      fontFamily: "monospace",
                    }}
                  >
                    Focus
                  </button>
                </div>
              );
            })}
          </>
        )}

        {/* Triggers */}
        {(table.triggers?.length ?? 0) > 0 && (
          <>
            <SectionHeader label="Triggers" theme={theme} count={table.triggers!.length} />
            {table.triggers!.map((t) => (
              <div
                key={t.name}
                style={{
                  padding: "4px 14px",
                  color: theme.textSecondary,
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ color: "#fb923c", fontSize: 10 }}>⚡</span>
                <span style={{ flex: 1 }}>{t.name}</span>
                <span style={{ color: theme.textType, fontSize: 9, background: `${theme.nodeBorder}44`, borderRadius: 3, padding: "1px 5px" }}>
                  {t.timing} {t.event}
                </span>
              </div>
            ))}
          </>
        )}

        {/* Definition preview (for procedures/functions) */}
        {["procedure", "function"].includes(table.objectType) && table.definition && (
          <>
            <SectionHeader label="Definition Preview" theme={theme} />
            <div style={{ padding: "4px 14px" }}>
              <pre style={{
                whiteSpace: "pre-wrap",
                fontSize: 10,
                color: theme.textSecondary,
                background: theme.nodeBg,
                border: `1px solid ${theme.nodeBorder}`,
                borderRadius: 6,
                padding: "8px 10px",
                maxHeight: 160,
                overflow: "auto",
              }}>
                {table.definition.slice(0, 500)}
                {table.definition.length > 500 && "\n\n...truncated"}
              </pre>
            </div>
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
            padding: "9px 12px",
            borderRadius: 8,
            background: "#6366f1",
            color: "#fff",
            border: "none",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "monospace",
            fontWeight: 600,
            transition: "background 150ms ease",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#4f46e5")}
          onMouseLeave={e => (e.currentTarget.style.background = "#6366f1")}
        >
          Ask AI about &quot;{table.name}&quot; ↗
        </button>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(340px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
