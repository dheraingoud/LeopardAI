"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import type { ParsedSchema, ObjectType } from "@/lib/schema-viz/types";
import type { SchemaVizTheme } from "@/lib/schema-viz/theme";
import { useSchemaVizStore } from "@/store/schemaVizStore";
import { useReactFlow } from "@xyflow/react";

function Divider({ theme }: { theme: SchemaVizTheme }) {
  return (
    <div style={{ width: 1, height: 20, background: theme.controlsBorder, flexShrink: 0 }} />
  );
}

function ToolBtn({ label, onClick, theme, title, active }: {
  label: string; onClick: () => void; theme: SchemaVizTheme; title?: string; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: "4px 10px", borderRadius: 6, fontSize: 10, fontFamily: "monospace",
        background: active ? "#6366f122" : "transparent",
        color: active ? "#6366f1" : theme.textSecondary,
        border: `1px solid ${active ? "#6366f1" : theme.controlsBorder}`,
        cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function FilterPill({ label, hidden, color, onClick }: {
  label: string; hidden: boolean; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "2px 8px", borderRadius: 10, fontSize: 9, fontFamily: "monospace",
        background: hidden ? "transparent" : color + "18",
        color: hidden ? "#555" : color,
        border: `1px solid ${hidden ? "#333" : color + "44"}`,
        cursor: "pointer", textDecoration: hidden ? "line-through" : "none",
      }}
    >
      {label}
    </button>
  );
}

export function TableSearch({ schema, theme }: { schema: ParsedSchema; theme: SchemaVizTheme }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { setFocusedTable } = useSchemaVizStore();
  const { setViewport } = useReactFlow();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") { setOpen(false); setQuery(""); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const results = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return schema.tables
      .filter(t => t.name.toLowerCase().includes(q) || t.columns.some(c => c.name.toLowerCase().includes(q)))
      .slice(0, 8)
      .map(t => ({ id: t.id, name: t.name, type: t.objectType, colMatch: t.columns.find(c => !t.name.toLowerCase().includes(q) && c.name.toLowerCase().includes(q))?.name }));
  }, [query, schema.tables]);

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        placeholder="Search… (⌘F)"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={{
          width: 160, padding: "5px 10px", borderRadius: 8, fontSize: 11,
          background: theme.canvasBg, border: `1px solid ${theme.nodeBorder}`,
          color: theme.textPrimary, outline: "none", fontFamily: "monospace",
        }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4, width: 260,
          background: theme.controlsBg, border: `1px solid ${theme.nodeBorder}`,
          borderRadius: 10, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.3)", zIndex: 999,
        }}>
          {results.map(r => (
            <button key={r.id} onClick={() => { setFocusedTable(r.id, schema.relationships); setOpen(false); setQuery(""); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px",
                background: "none", border: "none", cursor: "pointer", color: theme.textPrimary,
                fontSize: 11, fontFamily: "monospace", textAlign: "left",
              }}>
              <span style={{ color: theme.textType, fontSize: 9, textTransform: "uppercase" }}>{r.type.slice(0, 3)}</span>
              <span style={{ flex: 1 }}>{r.name}</span>
              {r.colMatch && <span style={{ color: theme.textType, fontSize: 9 }}>col: {r.colMatch}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatsBar({ schema, theme }: { schema: ParsedSchema; theme: SchemaVizTheme }) {
  const { stats, dialect, warnings } = schema;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16, padding: "5px 16px",
      borderRadius: 10, fontSize: 10, fontFamily: "monospace",
      background: theme.controlsBg + "dd", border: `1px solid ${theme.controlsBorder}`,
      backdropFilter: "blur(10px)", color: theme.textType,
    }}>
      <span style={{ color: "#4ade80" }}>{stats.tableCount} tables</span>
      <span style={{ color: "#60a5fa" }}>{stats.viewCount} views</span>
      <span style={{ color: "#c084fc" }}>{stats.procedureCount} procs</span>
      <span style={{ color: "#fb923c" }}>{stats.triggerCount} triggers</span>
      <span style={{ color: "#f59e0b" }}>{stats.relationshipCount} links</span>
      <span style={{
        marginLeft: "auto", padding: "1px 6px", borderRadius: 4,
        background: theme.dotColor, textTransform: "uppercase",
        letterSpacing: "0.1em", fontSize: 8,
      }}>{dialect}</span>
      {warnings.length > 0 && (
        <span title={warnings.join("\n")} style={{ color: "#fb923c", cursor: "help" }}>⚠ {warnings.length}</span>
      )}
    </div>
  );
}

export function SchemaVizToolbar({ schema, theme }: { schema: ParsedSchema; theme: SchemaVizTheme }) {
  const { toggleTheme, toggleObjectType, hiddenObjectTypes, layoutDirection, setLayoutDirection } = useSchemaVizStore();

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
      borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
      background: theme.controlsBg, border: `1px solid ${theme.controlsBorder}`,
    }}>
      <TableSearch schema={schema} theme={theme} />
      <Divider theme={theme} />
      <FilterPill label="Tables" hidden={hiddenObjectTypes.has("table")} color="#4ade80" onClick={() => toggleObjectType("table")} />
      <FilterPill label="Views" hidden={hiddenObjectTypes.has("view")} color="#60a5fa" onClick={() => toggleObjectType("view")} />
      <FilterPill label="Procs" hidden={hiddenObjectTypes.has("procedure")} color="#c084fc" onClick={() => toggleObjectType("procedure")} />
      <FilterPill label="Triggers" hidden={hiddenObjectTypes.has("trigger")} color="#fb923c" onClick={() => toggleObjectType("trigger")} />
      <Divider theme={theme} />
      <ToolBtn label={layoutDirection === "LR" ? "→ LR" : "↓ TB"} onClick={() => setLayoutDirection(layoutDirection === "LR" ? "TB" : "LR")} theme={theme} title="Toggle layout direction" />
      <Divider theme={theme} />
      <ToolBtn label={theme.id === "dark" ? "☀ Light" : "◐ Dark"} onClick={toggleTheme} theme={theme} title="Toggle theme" />
    </div>
  );
}
