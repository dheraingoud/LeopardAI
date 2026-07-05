"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { compressForStorage, decompressFromStorage } from "@/lib/compress";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { Id } from "@/convex/_generated/dataModel";
import {
  Database,
  FileText,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Upload,
  X,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import InputBar from "@/components/input-bar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  type ParsedSchemaGraph,
  parseSchemaFromFiles,
  type SchemaTableNode,
  type SqlSchemaFile,
  type SchemaColumn,
  type SchemaEdge,
} from "@/lib/schema-graph";
import { persistImagesForMessage, sanitizeMessageForStorage } from "@/lib/image-cache";
import { buildWorkspaceContextPack } from "@/lib/workspace-context-pack";
import SchemaVizCanvas from "@/components/schema-viz/SchemaVizCanvas";
import SchemaChatOverlay from "@/components/schema-chat-overlay";
import type { ParsedSchema, ParsedTable, ParsedRelationship, ParsedColumn as VizParsedColumn } from "@/lib/schema-viz/types";

// Adapter: Convert legacy SchemaTableNode to ParsedTable
function adaptTableToParsed(table: SchemaTableNode): ParsedTable {
  return {
    id: table.id,
    name: table.name,
    schema: table.schema,
    database: undefined,
    objectType: "table",
    columns: table.columns.map((col: SchemaColumn): VizParsedColumn => ({
      name: col.name,
      type: col.type,
      normalizedType: col.type.toLowerCase().includes("int") ? "number" : col.type.toLowerCase().includes("bool") ? "boolean" : col.type.toLowerCase().includes("date") || col.type.toLowerCase().includes("time") ? "date" : col.type.toLowerCase().includes("json") ? "json" : "string",
      nullable: col.nullable,
      primaryKey: col.isPrimary,
      unique: col.isPrimary,
      identity: false,
      defaultValue: undefined,
      checkConstraint: undefined,
      references: undefined,
      comment: undefined,
    })),
    indexes: [],
    primaryKeys: table.columns.filter((c) => c.isPrimary).map((c) => c.name),
    uniqueConstraints: [],
    checkConstraints: [],
    comment: undefined,
    isTemporary: false,
    definition: undefined,
    triggers: undefined,
  };
}

// Adapter: Convert legacy SchemaEdge to ParsedRelationship
function adaptEdgeToRelationship(edge: SchemaEdge, index: number): ParsedRelationship {
  return {
    id: edge.id || `rel-${index}`,
    fromTable: edge.source,
    fromColumn: edge.sourceColumn || "id",
    toTable: edge.target || edge.floatingTarget || "",
    toColumn: edge.targetColumn || "id",
    cardinality: "one-to-many",
    onDelete: undefined,
    onUpdate: undefined,
    constraintName: edge.kind === "floating" ? "(inferred)" : undefined,
  };
}

// Adapter: Convert legacy ParsedSchemaGraph to ParsedSchema
function adaptGraphToSchema(graph: ParsedSchemaGraph, files: SqlSchemaFile[]): ParsedSchema {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `schema-${Date.now()}`,
    sourceFile: files[0]?.name || "unknown.sql",
    dialect: "postgresql",
    tables: graph.tables.map(adaptTableToParsed),
    relationships: graph.edges.map((e, i) => adaptEdgeToRelationship(e, i)).filter((r) => r.toTable),
    enums: [],
    warnings: graph.diagnostics || [],
    summary: `${graph.tables.length} tables, ${graph.edges.length} relationships`,
    stats: {
      tableCount: graph.tables.length,
      viewCount: 0,
      procedureCount: 0,
      triggerCount: 0,
      relationshipCount: graph.edges.length,
      parseTimeMs: 0,
    },
  };
}

// Hook-safe userId getter
function useUserId(): string | undefined {
  const { user } = useUser();
  return user?.id;
}

interface Position {
  x: number;
  y: number;
}

interface SchemaWorkspace {
  id: string;
  name: string;
  files: SqlSchemaFile[];
  graph: ParsedSchemaGraph;
  nodePositions: Record<string, Position>;
  createdAt: number;
  linkedQaChatId?: string;
}

interface PendingDecision {
  files: SqlSchemaFile[];
  sourceWorkspaceId: string;
}

interface SendOptions {
  inlineImages?: string[];
}

interface PersistedSchemaWorkspace {
  id: string;
  name: string;
  files: SqlSchemaFile[];
  nodePositions: Record<string, Position>;
  createdAt: number;
  linkedQaChatId?: string;
}

interface StoredSchemaState {
  workspaces: PersistedSchemaWorkspace[];
  activeWorkspaceId: string;
}

type DragState =
  | {
      type: "pan";
      originX: number;
      originY: number;
      startPan: Position;
    }
  | {
      type: "node";
      nodeId: string;
      originX: number;
      originY: number;
      startPos: Position;
    };

const EMPTY_GRAPH: ParsedSchemaGraph = {
  tables: [],
  edges: [],
  floatingTargets: [],
  diagnostics: [],
};

const TABLE_WIDTH = 320;
const FLOATING_WIDTH = 220;
const TABLE_HEADER_HEIGHT = 44;
const COLUMN_ROW_HEIGHT = 22;
const FLOATING_HEIGHT = 82;
const SCHEMA_STORAGE_KEY = "leopard.schema.workspaces.v1";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_STORED_SQL_CHARS = 1_600_000;

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hashText(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function floatingNodeId(label: string): string {
  return `floating:${label}`;
}

function mergeFiles(existing: SqlSchemaFile[], incoming: SqlSchemaFile[]): SqlSchemaFile[] {
  const next = [...existing];
  incoming.forEach((file) => {
    if (!file.content.trim()) return;
    const existingIndex = next.findIndex((entry) => entry.name === file.name);
    if (existingIndex >= 0) {
      // Same name → replace content (deduplicate)
      next[existingIndex] = { ...next[existingIndex], content: file.content, id: file.id };
    } else {
      next.push(file);
    }
  });
  return next;
}

function tableHeight(table: SchemaTableNode): number {
  const visibleRows = Math.min(table.columns.length, 8);
  const overflow = table.columns.length > 8 ? 22 : 0;
  return TABLE_HEADER_HEIGHT + visibleRows * COLUMN_ROW_HEIGHT + overflow + 12;
}

function buildNodePositions(
  graph: ParsedSchemaGraph,
  previous: Record<string, Position>,
): Record<string, Position> {
  const next: Record<string, Position> = { ...previous };
  const tableIds = graph.tables.map((table) => table.id);
  const floatingIds = graph.floatingTargets.map((target) => floatingNodeId(target));
  const allIds = [...tableIds, ...floatingIds];

  const useDenseGrid = tableIds.length > 24;

  if (useDenseGrid) {
    const columns = Math.max(4, Math.ceil(Math.sqrt(tableIds.length * 1.1)));
    graph.tables.forEach((table, index) => {
      if (next[table.id]) return;
      const row = Math.floor(index / columns);
      const col = index % columns;
      const schemaJitter = hashText(table.schema || "public") % 3;
      next[table.id] = {
        x: 170 + col * 420 + schemaJitter * 24,
        y: 150 + row * 250,
      };
    });
  } else {
    let placementIndex = 0;
    tableIds.forEach((id) => {
      if (next[id]) return;

      const angle = placementIndex * 0.69;
      const ring = Math.floor(placementIndex / 8);
      const baseRadius = 320 + ring * 190;
      const jitter = ((placementIndex % 4) - 1.5) * 30;
      next[id] = {
        x: 980 + Math.cos(angle) * (baseRadius + jitter),
        y: 720 + Math.sin(angle) * (baseRadius - jitter),
      };
      placementIndex += 1;
    });
  }

  floatingIds.forEach((id, index) => {
    if (next[id]) return;
    next[id] = {
      x: 260 + (index % 2) * 260,
      y: 180 + index * 118,
    };
  });

  graph.floatingTargets.forEach((target) => {
    const id = floatingNodeId(target);
    if (previous[id]) return;

    const sourceEdge = graph.edges.find(
      (edge) => edge.floatingTarget === target && Boolean(next[edge.source]),
    );

    if (!sourceEdge) return;

    const sourcePosition = next[sourceEdge.source];
    const offsetDirection = hashText(target) % 2 === 0 ? 1 : -1;
    next[id] = {
      x: sourcePosition.x + 360,
      y: sourcePosition.y + offsetDirection * (70 + (hashText(target) % 160)),
    };
  });

  Object.keys(next).forEach((id) => {
    if (!allIds.includes(id)) {
      delete next[id];
    }
  });

  return next;
}

function createWorkspace(name: string, files: SqlSchemaFile[] = []): SchemaWorkspace {
  const graph = files.length > 0 ? parseSchemaFromFiles(files) : EMPTY_GRAPH;
  return {
    id: makeId(),
    name,
    files,
    graph,
    nodePositions: buildNodePositions(graph, {}),
    createdAt: Date.now(),
  };
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function isSqlSchemaFile(value: unknown): value is SqlSchemaFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.content === "string"
  );
}

function restoreWorkspace(persisted: PersistedSchemaWorkspace): SchemaWorkspace {
  const files = Array.isArray(persisted.files)
    ? persisted.files.filter(isSqlSchemaFile)
    : [];
  const graph = files.length > 0 ? parseSchemaFromFiles(files) : EMPTY_GRAPH;
  const previousPositions =
    persisted.nodePositions && typeof persisted.nodePositions === "object"
      ? persisted.nodePositions
      : {};

  return {
    id: persisted.id,
    name: persisted.name,
    files,
    graph,
    nodePositions: buildNodePositions(graph, previousPositions),
    createdAt: persisted.createdAt,
    linkedQaChatId: persisted.linkedQaChatId,
  };
}

function serializeWorkspace(workspace: SchemaWorkspace): PersistedSchemaWorkspace {
  return {
    id: workspace.id,
    name: workspace.name,
    files: workspace.files,
    nodePositions: workspace.nodePositions,
    createdAt: workspace.createdAt,
    linkedQaChatId: workspace.linkedQaChatId,
  };
}

function getInitialSchemaState(): { workspaces: SchemaWorkspace[]; activeWorkspaceId: string } {
  const fallbackWorkspace = createWorkspace("Schema 1");
  const fallback = {
    workspaces: [fallbackWorkspace],
    activeWorkspaceId: fallbackWorkspace.id,
  };

  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(SCHEMA_STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(decompressFromStorage(raw)) as StoredSchemaState;
    if (!parsed || !Array.isArray(parsed.workspaces) || parsed.workspaces.length === 0) {
      return fallback;
    }

    const restored = parsed.workspaces
      .filter(
        (workspace): workspace is PersistedSchemaWorkspace =>
          Boolean(workspace) &&
          typeof workspace.id === "string" &&
          typeof workspace.name === "string" &&
          typeof workspace.createdAt === "number",
      )
      .map(restoreWorkspace);

    if (restored.length === 0) return fallback;

    const active = restored.find((workspace) => workspace.id === parsed.activeWorkspaceId)?.id
      || restored[0].id;

    return {
      workspaces: restored,
      activeWorkspaceId: active,
    };
  } catch {
    return fallback;
  }
}

function buildSchemaModelContext(workspace: SchemaWorkspace): string {
  const tableLines = workspace.graph.tables.slice(0, 80).map((table) => {
    const previewColumns = table.columns
      .slice(0, 12)
      .map((column) => `${column.name}:${column.type}${column.isPrimary ? ":pk" : ""}`)
      .join(", ");
    const more = table.columns.length > 12 ? ` (+${table.columns.length - 12} cols)` : "";
    return `- ${table.id} [${table.columns.length}] ${previewColumns}${more}`;
  });

  const connectionLines = workspace.graph.edges.slice(0, 180).map((edge) => {
    const source = edge.sourceColumn ? `${edge.source}.${edge.sourceColumn}` : edge.source;
    if (edge.target) {
      const target = edge.targetColumn ? `${edge.target}.${edge.targetColumn}` : edge.target;
      return `- ${source} -> ${target} (${edge.kind}, ${formatConfidence(edge.confidence)})`;
    }

    const suggestions = edge.suggestedTargetIds && edge.suggestedTargetIds.length > 0
      ? `, candidates: ${edge.suggestedTargetIds.join(" | ")}`
      : "";

    return `- ${source} -> unresolved:${edge.floatingTarget || "unknown"} (${edge.kind}, ${formatConfidence(edge.confidence)}${suggestions})`;
  });

  const parserNotes = workspace.graph.diagnostics.slice(0, 30);

  const pack = buildWorkspaceContextPack({
    workspace: workspace.name,
    mode: "SQL Schema Visualizer",
    objective: "Provide precise SQL-engineering guidance anchored to this schema graph, including joins, constraints, and migration safety.",
    sourceCount: workspace.files.length,
    maxChars: 30_000,
    sections: [
      {
        key: "schema-stats",
        title: "Schema Stats",
        required: true,
        priority: 100,
        content: [
          `Files: ${workspace.files.length}`,
          `Tables: ${workspace.graph.tables.length}`,
          `Edges: ${workspace.graph.edges.length}`,
          `Floating Targets: ${workspace.graph.floatingTargets.length}`,
        ].join("\n"),
      },
      {
        key: "tables",
        title: "Table Summary",
        required: true,
        priority: 95,
        maxChars: 14_000,
        content: tableLines.join("\n") || "- none",
      },
      {
        key: "relationships",
        title: "Relationship Summary",
        required: true,
        priority: 92,
        maxChars: 12_000,
        content: connectionLines.join("\n") || "- none",
      },
      {
        key: "sources",
        title: "Source Files",
        priority: 75,
        content: workspace.files.map((file) => `- ${file.name}`).join("\n") || "- none",
      },
      {
        key: "diagnostics",
        title: "Parser Notes",
        priority: 70,
        content: parserNotes.join("\n") || "- none",
      },
    ],
  });

  return pack.text;
}

export default function SchemaVisualizerPage() {
  const router = useRouter();
  const { user } = useUser();
  const createChat = useMutation(api.chats.create);
  const sendMessage = useMutation(api.messages.send);

  const [initialState] = useState(() => getInitialSchemaState());
  const [workspaces, setWorkspaces] = useState<SchemaWorkspace[]>(initialState.workspaces);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(initialState.activeWorkspaceId);

  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);
  const [draftName, setDraftName] = useState("adhoc-schema.sql");
  const [sqlDraft, setSqlDraft] = useState("");
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    if (isChatOpen) setLeftPanelOpen(false);
  }, [isChatOpen]);


  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) || workspaces[0],
    [activeWorkspaceId, workspaces],
  );

  const searchParams = useSearchParams();
  const urlChatId = searchParams.get("chatId") as Id<"chats"> | null;

  const sessionQuery = useQuery(api.schemaSessions.getByChat, urlChatId ? { chatId: urlChatId } : "skip");
  const saveSession = useMutation(api.schemaSessions.save);

  const [sessionChatId, setSessionChatId] = useState<string | null>(urlChatId);

  // Sync to local storage still, so offline/reload preserves it until chat is created
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stateToStore: StoredSchemaState = {
      activeWorkspaceId: activeWorkspace?.id || workspaces[0]?.id || "",
      workspaces: workspaces.map(serializeWorkspace),
    };
    window.localStorage.setItem(SCHEMA_STORAGE_KEY, compressForStorage(JSON.stringify(stateToStore)));
  }, [activeWorkspace?.id, workspaces]);

  // Load from convex if visited from a chat link
  useEffect(() => {
    if (sessionQuery?.workspaceData) {
      try {
        const parsed = JSON.parse(decompressFromStorage(sessionQuery.workspaceData)) as StoredSchemaState;
        if (parsed?.workspaces?.length > 0) {
          const restored = parsed.workspaces.map(restoreWorkspace);
          setWorkspaces(restored);
          setActiveWorkspaceId(parsed.activeWorkspaceId || restored[0].id);
        }
      } catch (e) {
        console.error("Failed to parse schema session from convex", e);
      }
    }
  }, [sessionQuery]);

  // Save to convex whenever workspaces change
  useEffect(() => {
    // Only create/sync a session if there's actual data (files), otherwise clicking 'Schema' creates blank sessions
    if (!user || workspaces.length === 0 || workspaces.every((w) => w.files.length === 0)) return;

    const timeoutId = setTimeout(() => {
      const syncToConvex = async () => {
        const stateToStore: StoredSchemaState = {
          activeWorkspaceId: activeWorkspace?.id || workspaces[0]?.id || "",
          workspaces: workspaces.map(serializeWorkspace),
        };

        try {
          if (!sessionChatId) {
            // Create new session chat
            const title = workspaces[0].name ? `SQL Viz: ${workspaces[0].name}` : "SQL Visualizer";
            const newChatId = await createChat({ 
              userId: user.id, 
              title, 
              model: "none", 
              type: "sql" 
            });
            setSessionChatId(newChatId);
            await saveSession({ chatId: newChatId, workspaceData: compressForStorage(JSON.stringify(stateToStore)) });
          } else {
            // Update existing
            await saveSession({ chatId: sessionChatId as Id<"chats">, workspaceData: compressForStorage(JSON.stringify(stateToStore)) });
          }
        } catch (error) {
          console.error("Failed to sync schema session to Convex:", error);
        }
      };
      
      syncToConvex();
    }, 1500); // 1.5s debounce to fix OCC transaction storm

    return () => clearTimeout(timeoutId);
  }, [workspaces, activeWorkspace, sessionChatId, user, createChat, saveSession]);

  const updateWorkspace = useCallback(
    (workspaceId: string, updater: (workspace: SchemaWorkspace) => SchemaWorkspace) => {
      setWorkspaces((previous) =>
        previous.map((workspace) =>
          workspace.id === workspaceId ? updater(workspace) : workspace,
        ),
      );
    },
    [],
  );

  const recomputeWorkspace = useCallback(
    (workspace: SchemaWorkspace, nextFiles: SqlSchemaFile[]): SchemaWorkspace => {
      const graph = parseSchemaFromFiles(nextFiles);
      const nodePositions = buildNodePositions(graph, workspace.nodePositions);
      return {
        ...workspace,
        files: nextFiles,
        graph,
        nodePositions,
      };
    },
    [],
  );

  const mergeIntoWorkspace = useCallback(
    (workspaceId: string, incoming: SqlSchemaFile[]) => {
      updateWorkspace(workspaceId, (workspace) => {
        let newName = workspace.name;
        if (workspace.files.length === 0 && incoming.length > 0 && incoming[0].name !== "adhoc-schema.sql") {
            if (incoming.length === 1) {
              newName = incoming[0].name.replace(/\.[^/.]+$/, "");
            } else {
              newName = `${incoming[0].name.replace(/\.[^/.]+$/, "")} (+${incoming.length - 1})`;
            }
        }

        const mergedFiles = mergeFiles(workspace.files, incoming);
        const nextWorkspace = recomputeWorkspace(workspace, mergedFiles);
        return { ...nextWorkspace, name: newName };
      });
    },
    [recomputeWorkspace, updateWorkspace],
  );

  const openNewWorkspaceWithFiles = useCallback((files: SqlSchemaFile[]) => {
    setWorkspaces((previous) => {
      let name = `Schema ${previous.length + 1}`;
      if (files.length === 1 && files[0].name !== "adhoc-schema.sql") {
        name = files[0].name.replace(/\.[^/.]+$/, ""); // Strip extension
      } else if (files.length > 1) {
        name = `${files[0].name.replace(/\.[^/.]+$/, "")} (+${files.length - 1})`;
      }
      
      const workspace = createWorkspace(name, files);
      setActiveWorkspaceId(workspace.id);
      return [...previous, workspace];
    });
  }, []);

  const closeWorkspace = useCallback((workspaceId: string) => {
    setWorkspaces((previous) => {
      if (previous.length <= 1) {
        const fresh = createWorkspace("Schema 1");
        setActiveWorkspaceId(fresh.id);
        return [fresh];
      }

      const index = previous.findIndex((workspace) => workspace.id === workspaceId);
      if (index < 0) return previous;

      const next = previous.filter((workspace) => workspace.id !== workspaceId);
      setActiveWorkspaceId((current) => {
        if (current !== workspaceId) return current;
        const fallback = next[index] || next[index - 1] || next[0];
        return fallback.id;
      });

      return next;
    });
  }, []);

  const queueIncomingFiles = useCallback(
    (files: SqlSchemaFile[]) => {
      if (!activeWorkspace || files.length === 0) return;

      if (activeWorkspace.files.length === 0) {
        mergeIntoWorkspace(activeWorkspace.id, files);
        toast.success(`Loaded ${files.length} schema file${files.length > 1 ? "s" : ""}`);
        return;
      }

      setPendingDecision({
        files,
        sourceWorkspaceId: activeWorkspace.id,
      });
    },
    [activeWorkspace, mergeIntoWorkspace],
  );

  const handleNativeFileSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const target = event.currentTarget;
      const selected = target.files ? Array.from(target.files) : [];
      if (selected.length === 0) return;

      const parsed: SqlSchemaFile[] = [];
      const warnings: string[] = [];

      for (const file of selected) {
        if (file.size > MAX_UPLOAD_BYTES) {
          warnings.push(`${file.name} skipped (>${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB).`);
          continue;
        }

        let content = await file.text();
        if (content.length > MAX_STORED_SQL_CHARS) {
          const head = content.slice(0, 1_000_000);
          const tail = content.slice(-450_000);
          content = `${head}\n\n-- [middle omitted before storing to keep workspace fast]\n\n${tail}`;
          warnings.push(`${file.name} truncated for responsive rendering and local session storage.`);
        }

        parsed.push({
          id: makeId(),
          name: file.name,
          content,
        });
      }

      warnings.forEach((warning) => {
        toast.message(warning);
      });

      if (parsed.length === 0) {
        target.value = "";
        return;
      }

      queueIncomingFiles(parsed);
      target.value = "";
    },
    [queueIncomingFiles],
  );

  const handleAddSqlDraft = useCallback(() => {
    const content = sqlDraft.trim();
    if (!content) {
      toast.error("Paste SQL or Snowflake DDL before adding.");
      return;
    }

    const filename = draftName.trim() || `snippet-${Date.now()}.sql`;
    queueIncomingFiles([{ id: makeId(), name: filename, content }]);
    setSqlDraft("");
    toast.success("SQL snippet queued for schema merge.");
  }, [draftName, queueIncomingFiles, sqlDraft]);

  const handleDecision = useCallback(
    (isRelated: boolean) => {
      if (!pendingDecision) return;

      if (isRelated) {
        mergeIntoWorkspace(pendingDecision.sourceWorkspaceId, pendingDecision.files);
        toast.success("Schema merged. Floating links may auto-resolve now.");
      } else {
        openNewWorkspaceWithFiles(pendingDecision.files);
        toast.success("Opened a new schema workspace for unrelated files.");
      }

      setPendingDecision(null);
    },
    [mergeIntoWorkspace, openNewWorkspaceWithFiles, pendingDecision],
  );

  const handleResetSavedSessions = useCallback(() => {
    const fresh = createWorkspace("Schema 1");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SCHEMA_STORAGE_KEY);
    }
    setWorkspaces([fresh]);
    setActiveWorkspaceId(fresh.id);
    setPendingDecision(null);
    toast.success("Reset SQL visualizer sessions.");
  }, []);

  const handleCopySchemaContext = useCallback(async () => {
    if (!activeWorkspace) return;

    const context = buildSchemaModelContext(activeWorkspace);
    try {
      await navigator.clipboard.writeText(context);
      toast.success("Copied schema context snapshot.");
    } catch {
      toast.error("Clipboard write failed.");
    }
  }, [activeWorkspace]);

  const handleAskSchema = useCallback(
    async (message: string, model: string, options?: SendOptions) => {
      if (!user) {
        toast.error("Sign in to ask schema questions.");
        return;
      }
      if (!activeWorkspace) {
        toast.error("Create or load a schema workspace first.");
        return;
      }

      // Store ONLY the user's clean question — schema context is injected silently
      const cleanQuestion = message.trim();
      const sanitized = sanitizeMessageForStorage(cleanQuestion);

      let targetChatId = activeWorkspace.linkedQaChatId;

      if (!targetChatId) {
        let chatName = activeWorkspace.name;
        if (chatName.toLowerCase().endsWith(".sql")) {
          chatName = chatName.slice(0, -4);
        }

        targetChatId = await createChat({
          userId: user.id,
          title: chatName,
          model,
        });

        // Link the workspace to this new chat visually so future questions reuse it
        const newWorkspace = { ...activeWorkspace, linkedQaChatId: targetChatId };
        updateWorkspace(activeWorkspace.id, () => newWorkspace);

        // Instantly force save to Convex so it doesn't get lost
        if (sessionChatId) {
          const stateToStore: StoredSchemaState = {
            activeWorkspaceId: newWorkspace.id,
            workspaces: workspaces.map(w => w.id === newWorkspace.id ? serializeWorkspace(newWorkspace) : serializeWorkspace(w)),
          };
          saveSession({ chatId: sessionChatId as Id<"chats">, workspaceData: compressForStorage(JSON.stringify(stateToStore)) }).catch(() => {});
        }
      }

      const userMessageId = await sendMessage({
        chatId: targetChatId as Id<"chats">,
        userId: user.id,
        role: "user",
        content: sanitized.content,
      });

      if (sanitized.images.length > 0) {
        await persistImagesForMessage(String(userMessageId), sanitized.images);
      }

      setIsChatOpen(true);
    },
    [activeWorkspace, createChat, router, sendMessage, user, updateWorkspace, workspaces, sessionChatId, saveSession],
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Adapt legacy graph to ParsedSchema for SchemaVizCanvas
  const vizSchema = useMemo<ParsedSchema | null>(() => {
    if (!activeWorkspace || activeWorkspace.graph.tables.length === 0) return null;
    return adaptGraphToSchema(activeWorkspace.graph, activeWorkspace.files);
  }, [activeWorkspace]);


  const totalColumns = activeWorkspace
    ? activeWorkspace.graph.tables.reduce((sum, t) => sum + t.columns.length, 0)
    : 0;
  const unresolvedCount = activeWorkspace
    ? activeWorkspace.graph.edges.filter((e) => e.kind === "floating").length
    : 0;

  return (
    <div className="h-full w-full flex flex-col">
      {/* ─── Header Bar ─── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setLeftPanelOpen((prev) => !prev)}
          title={leftPanelOpen ? "Hide panel" : "Show panel"}
        >
          {leftPanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        </Button>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-leopard-amber-subtle border border-leopard-border-bright">
          <Database className="h-3.5 w-3.5 text-leopard-amber" />
          <span className="text-xs font-semibold tracking-wider text-leopard-amber">DATABASE</span>
        </div>

        {/* Workspace tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0">
          {workspaces.map((workspace) => {
            const active = workspace.id === activeWorkspaceId;
            return (
              <div
                key={workspace.id}
                className={cn(
                  "inline-flex items-center rounded-md border pr-0.5 transition-colors shrink-0",
                  active
                    ? "border-leopard-border-bright bg-leopard-amber-subtle text-leopard-amber"
                    : "border-border bg-leopard-surface-glass text-muted-foreground hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => setActiveWorkspaceId(workspace.id)}
                  className="px-2.5 py-1 text-xs truncate max-w-[120px]"
                  title={`${workspace.graph.tables.length} tables · ${workspace.files.length} files`}
                >
                  {workspace.name}
                </button>
                <button
                  type="button"
                  onClick={() => closeWorkspace(workspace.id)}
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] hover:bg-leopard-amber-subtle"
                  title={`Close ${workspace.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => {
              const workspace = createWorkspace(`Schema ${workspaces.length + 1}`);
              setWorkspaces((previous) => [...previous, workspace]);
              setActiveWorkspaceId(workspace.id);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-leopard-border-bright hover:text-leopard-amber transition-colors shrink-0"
          >
            <Plus className="h-3 w-3" />
            New
          </button>
        </div>

        {/* Stats pills */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs">
          <span className="px-2 py-1 rounded-md border border-border bg-card">
            <span className="text-muted-foreground mr-1">Tables</span>
            <span className="font-semibold text-foreground">{activeWorkspace?.graph.tables.length || 0}</span>
          </span>
          <span className="px-2 py-1 rounded-md border border-border bg-card">
            <span className="text-muted-foreground mr-1">Cols</span>
            <span className="font-semibold text-foreground">{totalColumns}</span>
          </span>
          <span className="px-2 py-1 rounded-md border border-border bg-card">
            <span className="text-muted-foreground mr-1">Relations</span>
            <span className="font-semibold text-foreground">{activeWorkspace?.graph.edges.length || 0}</span>
          </span>
          {unresolvedCount > 0 && (
            <span className="px-2 py-1 rounded-md border border-amber-500/30 bg-amber-500/10">
              <span className="text-amber-400 mr-1">Unresolved</span>
              <span className="font-semibold text-amber-300">{unresolvedCount}</span>
            </span>
          )}

          <div className="w-px h-4 bg-border mx-1" />

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={cn("h-7 px-3 flex items-center gap-1.5 transition-colors", isChatOpen ? "bg-leopard-amber-subtle text-leopard-amber border-leopard-amber" : "")}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {isChatOpen ? "Close Assistant" : "Ask AI"}
          </Button>
        </div>
      </div>

      {/* ─── Main Content: Sidebar + Canvas ─── */}
      <div className="flex flex-1 min-h-0">
        {/* Left Panel — Supabase-style sidebar */}
        {leftPanelOpen && (
          <div className="w-[280px] shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
              {/* Upload Section */}
              <section className="rounded-lg border border-border p-3">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Schema Input</h2>
                <p className="mb-2 text-xs text-muted-foreground">
                  Upload SQL/Snowflake DDL files to visualize your database schema.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-full justify-center text-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload SQL Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sql,.txt,.ddl,.snowflake,.md,.hql,.bq,.bigquery,.tsql,.plsql,.sqlite,.prisma,.csv,.entity.ts"
                  multiple
                  className="hidden"
                  onChange={handleNativeFileSelection}
                />

                <div className="mt-3 space-y-2">
                  <Input
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    placeholder="snippet.sql"
                    className="h-8 text-xs"
                  />
                  <Textarea
                    value={sqlDraft}
                    onChange={(event) => setSqlDraft(event.target.value)}
                    placeholder="Paste SQL DDL, references, joins..."
                    className="min-h-[100px] resize-y text-xs leading-relaxed"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 w-full text-xs"
                    onClick={handleAddSqlDraft}
                  >
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    Add SQL Snippet
                  </Button>
                </div>
              </section>

              {/* Loaded Files */}
              <section className="rounded-lg border border-border p-3">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Loaded Files</h2>
                {activeWorkspace && activeWorkspace.files.length > 0 ? (
                  <div className="max-h-40 space-y-1.5 overflow-auto pr-1">
                    {activeWorkspace.files.map((file) => (
                      <div key={file.id} className="rounded-md border border-border px-2.5 py-2">
                        <p className="truncate text-xs font-medium text-foreground">{file.name}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{file.content.length.toLocaleString()} chars</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                    No files loaded yet.
                  </p>
                )}
              </section>

              {/* Session */}
              <section className="rounded-lg border border-border p-3">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Session</h2>
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={handleCopySchemaContext}
                  >
                    Copy Context Snapshot
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/15 text-xs"
                    onClick={handleResetSavedSessions}
                  >
                    Reset All Sessions
                  </Button>
                </div>
              </section>

              {/* Parser Notes */}
              {activeWorkspace && activeWorkspace.graph.diagnostics.length > 0 && (
                <section className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-500">Parser Notes</p>
                  <div className="space-y-1 text-xs text-amber-600 dark:text-amber-300">
                    {activeWorkspace.graph.diagnostics.slice(0, 10).map((diagnostic) => (
                      <p key={diagnostic}>• {diagnostic}</p>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}

        {/* Canvas Area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
          {/* ReactFlow Canvas */}
          <div className="flex-1 min-h-0">
            {vizSchema ? (
              <SchemaVizCanvas schema={vizSchema} />
            ) : (
              <div className="h-full flex items-center justify-center bg-background">
                <div className="max-w-[360px] text-center p-6">
                  <div className="mx-auto mb-4 h-12 w-12 rounded-xl border border-dashed border-border flex items-center justify-center">
                    <Database className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-semibold text-foreground mb-2">No schema loaded</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Upload SQL files or paste DDL in the sidebar to visualize your database schema with interactive nodes and relationship edges.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* DB Assistant — flex sibling, properly shares space */}
        {isChatOpen && (
          <SchemaChatOverlay
            chatId={activeWorkspace?.linkedQaChatId}
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            onSendFirstMessage={handleAskSchema}
            schemaSystemContext={activeWorkspace ? buildSchemaModelContext(activeWorkspace) : undefined}
          />
        )}
      </div>

      {/* Merge Decision Dialog */}
      <Dialog
        open={Boolean(pendingDecision)}
        onOpenChange={(open) => {
          if (!open) setPendingDecision(null);
        }}
      >
        <DialogContent className="max-w-lg" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-base text-leopard-amber">Is this upload related to this schema window?</DialogTitle>
            <DialogDescription>
              Related merges into the current window. Unrelated opens a new SQL schema window.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-card p-3">
            <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Queued Files</p>
            <div className="space-y-1.5 text-xs text-foreground">
              {pendingDecision?.files.map((file) => (
                <p key={file.id} className="truncate">• {file.name}</p>
              ))}
            </div>
          </div>

          <DialogFooter className="mt-1 border-0 bg-transparent p-0">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDecision(true)}
              >
                Related: Merge into current
              </Button>
              <Button
                type="button"
                className="bg-leopard-amber text-black hover:bg-leopard-amber/90"
                onClick={() => handleDecision(false)}
              >
                Not related: New window
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
