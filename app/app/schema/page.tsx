"use client";

import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { Id } from "@/convex/_generated/dataModel";
import { motion } from "framer-motion";
import {
  BarChart3,
  Database,
  FileText,
  Link2,
  Link2Off,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Sparkles,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
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
} from "@/lib/schema-graph";
import { persistImagesForMessage, sanitizeMessageForStorage } from "@/lib/image-cache";
import { buildWorkspaceContextPack } from "@/lib/workspace-context-pack";

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
    const duplicate = next.find(
      (entry) => entry.name === file.name && entry.content.trim() === file.content.trim(),
    );
    if (!duplicate && file.content.trim()) {
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

    const parsed = JSON.parse(raw) as StoredSchemaState;
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
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState<Position>({ x: 120, y: 130 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const dragRef = useRef<DragState | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    window.localStorage.setItem(SCHEMA_STORAGE_KEY, JSON.stringify(stateToStore));
  }, [activeWorkspace?.id, workspaces]);

  // Load from convex if visited from a chat link
  useEffect(() => {
    if (sessionQuery?.workspaceData) {
      try {
        const parsed = JSON.parse(sessionQuery.workspaceData) as StoredSchemaState;
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
            await saveSession({ chatId: newChatId, workspaceData: JSON.stringify(stateToStore) });
          } else {
            // Update existing
            await saveSession({ chatId: sessionChatId as Id<"chats">, workspaceData: JSON.stringify(stateToStore) });
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
        const mergedFiles = mergeFiles(workspace.files, incoming);
        return recomputeWorkspace(workspace, mergedFiles);
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

      const schemaContext = buildSchemaModelContext(activeWorkspace);
      const filename = `${activeWorkspace.name.trim() || 'schema'}.sql`;
      
      const composedMessage = [
        message.trim(),
        "",
        "```sql",
        `// ${filename}`,
        schemaContext,
        "```",
        "",
        "Instruction: answer as a senior SQL/DB engineer. Prioritize exact joins, key constraints, data quality assumptions, and migration safety.",
      ].join("\n");

      const imageMarkdown = (options?.inlineImages || [])
        .map((url) => `![Attached image](${url})`)
        .join("\n\n");

      const contentForStorage = imageMarkdown
        ? `${composedMessage}\n\n${imageMarkdown}`.trim()
        : composedMessage;

      const sanitized = sanitizeMessageForStorage(contentForStorage);

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

        // Instantly force save to Convex so it doesn't get lost in the page unmount!
        if (sessionChatId) {
          const stateToStore: StoredSchemaState = {
            activeWorkspaceId: newWorkspace.id,
            workspaces: workspaces.map(w => w.id === newWorkspace.id ? serializeWorkspace(newWorkspace) : serializeWorkspace(w)),
          };
          // Best effort sync
          saveSession({ chatId: sessionChatId as Id<"chats">, workspaceData: JSON.stringify(stateToStore) }).catch(() => {});
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

      router.push(`/app/chat/${targetChatId}`);
      toast.success("Opened schema-aware chat.");
    },
    [activeWorkspace, createChat, router, sendMessage, user, updateWorkspace, workspaces, sessionChatId, saveSession],
  );

  const tableMap = useMemo(() => {
    const map = new Map<string, SchemaTableNode>();
    if (!activeWorkspace) return map;
    activeWorkspace.graph.tables.forEach((table) => {
      map.set(table.id, table);
    });
    return map;
  }, [activeWorkspace]);

  const floatingNodes = useMemo(
    () =>
      activeWorkspace
        ? activeWorkspace.graph.floatingTargets.map((target) => ({
            id: floatingNodeId(target),
            label: target,
          }))
        : [],
    [activeWorkspace],
  );

  const floatingSuggestionMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!activeWorkspace) return map;

    activeWorkspace.graph.edges.forEach((edge) => {
      if (edge.kind !== "floating" || !edge.floatingTarget) return;
      const current = map.get(edge.floatingTarget) || [];
      const merged = Array.from(new Set([...current, ...(edge.suggestedTargetIds || [])])).slice(0, 3);
      map.set(edge.floatingTarget, merged);
    });

    return map;
  }, [activeWorkspace]);

  const totalColumns = activeWorkspace
    ? activeWorkspace.graph.tables.reduce((sum, table) => sum + table.columns.length, 0)
    : 0;

  const canvasSize = useMemo(() => {
    if (!activeWorkspace) {
      return { width: 2600, height: 1800 };
    }

    const entries = Object.entries(activeWorkspace.nodePositions);
    if (entries.length === 0) {
      return { width: 2600, height: 1800 };
    }

    let maxX = 1600;
    let maxY = 1200;

    entries.forEach(([id, position]) => {
      const isFloating = id.startsWith("floating:");
      const width = isFloating ? FLOATING_WIDTH : TABLE_WIDTH;
      const height = isFloating
        ? FLOATING_HEIGHT
        : tableHeight(
            tableMap.get(id) || {
              id,
              name: id,
              columns: [],
              sourceFileIds: [],
            },
          );
      maxX = Math.max(maxX, position.x + width + 240);
      maxY = Math.max(maxY, position.y + height + 240);
    });

    return {
      width: Math.max(2200, maxX),
      height: Math.max(1600, maxY),
    };
  }, [activeWorkspace, tableMap]);

  const getSourceAnchor = useCallback(
    (tableId: string, sourceColumn?: string): Position | null => {
      if (!activeWorkspace) return null;
      const pos = activeWorkspace.nodePositions[tableId];
      const table = tableMap.get(tableId);
      if (!pos || !table) return null;

      let rowIndex = Math.floor(Math.min(table.columns.length, 8) / 2);
      if (sourceColumn) {
        const idx = table.columns.findIndex((column) => column.name === sourceColumn);
        if (idx >= 0) rowIndex = Math.min(idx, 7);
      }

      return {
        x: pos.x + TABLE_WIDTH,
        y: pos.y + TABLE_HEADER_HEIGHT + 12 + rowIndex * COLUMN_ROW_HEIGHT,
      };
    },
    [activeWorkspace, tableMap],
  );

  const getTargetAnchor = useCallback(
    (targetId: string, targetColumn?: string): Position | null => {
      if (!activeWorkspace) return null;
      const position = activeWorkspace.nodePositions[targetId];
      if (!position) return null;

      if (targetId.startsWith("floating:")) {
        return {
          x: position.x,
          y: position.y + FLOATING_HEIGHT / 2,
        };
      }

      const table = tableMap.get(targetId);
      if (!table) return null;

      let rowIndex = Math.floor(Math.min(table.columns.length, 8) / 2);
      if (targetColumn) {
        const idx = table.columns.findIndex((column) => column.name === targetColumn);
        if (idx >= 0) rowIndex = Math.min(idx, 7);
      }

      return {
        x: position.x,
        y: position.y + TABLE_HEADER_HEIGHT + 12 + rowIndex * COLUMN_ROW_HEIGHT,
      };
    },
    [activeWorkspace, tableMap],
  );

  const edges = useMemo(() => {
    if (!activeWorkspace) return [];

    return activeWorkspace.graph.edges
      .map((edge) => {
        const source = getSourceAnchor(edge.source, edge.sourceColumn);
        const target = edge.target
          ? getTargetAnchor(edge.target, edge.targetColumn)
          : edge.floatingTarget
            ? getTargetAnchor(floatingNodeId(edge.floatingTarget))
            : null;

        if (!source || !target) return null;

        const curve = Math.max(90, Math.min(260, Math.abs(target.x - source.x) * 0.45));
        const path = `M ${source.x} ${source.y} C ${source.x + curve} ${source.y}, ${target.x - curve} ${target.y}, ${target.x} ${target.y}`;

        return {
          ...edge,
          source,
          target,
          path,
          labelX: (source.x + target.x) / 2,
          labelY: (source.y + target.y) / 2,
        };
      })
      .filter(Boolean) as Array<
      ParsedSchemaGraph["edges"][number] & {
        source: Position;
        target: Position;
        path: string;
        labelX: number;
        labelY: number;
      }
    >;
  }, [activeWorkspace, getSourceAnchor, getTargetAnchor]);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!viewportRef.current) return;

      const rect = viewportRef.current.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;

      const nextZoom = Math.min(1.8, Math.max(0.45, zoom + event.deltaY * -0.0013));
      const worldX = (cursorX - pan.x) / zoom;
      const worldY = (cursorY - pan.y) / zoom;

      setZoom(nextZoom);
      setPan({
        x: cursorX - worldX * nextZoom,
        y: cursorY - worldY * nextZoom,
      });
    },
    [pan.x, pan.y, zoom],
  );

  const handleCanvasPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest("[data-schema-node='true']")) return;
      if (target.closest("[data-canvas-control='true']")) return;

      dragRef.current = {
        type: "pan",
        originX: event.clientX,
        originY: event.clientY,
        startPan: pan,
      };
      setIsPanning(true);
    },
    [pan],
  );

  const handleNodePointerDown = useCallback(
    (nodeId: string, event: ReactPointerEvent<HTMLDivElement>) => {
      if (!activeWorkspace || event.button !== 0) return;
      event.stopPropagation();
      const current = activeWorkspace.nodePositions[nodeId];
      if (!current) return;

      dragRef.current = {
        type: "node",
        nodeId,
        originX: event.clientX,
        originY: event.clientY,
        startPos: current,
      };
      setDraggingNodeId(nodeId);
    },
    [activeWorkspace],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.type === "pan") {
        const deltaX = event.clientX - drag.originX;
        const deltaY = event.clientY - drag.originY;
        setPan({
          x: drag.startPan.x + deltaX,
          y: drag.startPan.y + deltaY,
        });
        return;
      }

      const activeId = activeWorkspaceId;
      const dx = (event.clientX - drag.originX) / zoom;
      const dy = (event.clientY - drag.originY) / zoom;

      setWorkspaces((previous) =>
        previous.map((workspace) => {
          if (workspace.id !== activeId) return workspace;
          return {
            ...workspace,
            nodePositions: {
              ...workspace.nodePositions,
              [drag.nodeId]: {
                x: drag.startPos.x + dx,
                y: drag.startPos.y + dy,
              },
            },
          };
        }),
      );
    };

    const onUp = () => {
      dragRef.current = null;
      setDraggingNodeId(null);
      setIsPanning(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [activeWorkspaceId, zoom]);

  const unresolvedCount = activeWorkspace
    ? activeWorkspace.graph.edges.filter((edge) => edge.kind === "floating").length
    : 0;

  return (
    <div className="h-full w-full p-2 sm:p-3">
        <div
          ref={viewportRef}
          className={cn(
            "relative h-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#090909]",
            isPanning ? "cursor-grabbing" : "cursor-grab",
          )}
          onWheel={handleWheel}
          onPointerDown={handleCanvasPointerDown}
        >
          <div
            className="absolute inset-0 opacity-45"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
            }}
          />

          <div
            className="absolute left-0 top-0"
            style={{
              width: canvasSize.width,
              height: canvasSize.height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <svg
              width={canvasSize.width}
              height={canvasSize.height}
              className="pointer-events-none absolute inset-0"
            >
              {edges.map((edge) => {
                const floating = edge.kind === "floating";
                const inferred = edge.kind === "inferred";
                const stroke = floating
                  ? "rgba(245, 158, 11, 0.9)"
                  : inferred
                    ? "rgba(113, 196, 255, 0.92)"
                    : "rgba(16, 185, 129, 0.95)";

                return (
                  <g key={edge.id}>
                    <path
                      d={edge.path}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={floating ? 1.5 : 2}
                      strokeDasharray={floating ? "6 6" : inferred ? "4 4" : undefined}
                      opacity={0.8}
                    />
                    <circle cx={edge.source.x} cy={edge.source.y} r={2} fill={stroke} />
                    <circle cx={edge.target.x} cy={edge.target.y} r={2} fill={stroke} />
                  </g>
                );
              })}
            </svg>

            {activeWorkspace?.graph.tables.map((table) => {
              const position = activeWorkspace.nodePositions[table.id];
              if (!position) return null;
              const height = tableHeight(table);
              return (
                <div
              key={table.id}
              data-schema-node="true"
              onPointerDown={(event) => handleNodePointerDown(table.id, event)}
              className={cn(
                "absolute rounded-xl border border-white/[0.12] bg-[#111] shadow-2xl",
                    draggingNodeId === table.id
                      ? "ring-2 ring-[#ffb40055]"
                      : "hover:border-[#ffb40045]",
                  )}
                  style={{
                    width: TABLE_WIDTH,
                    height,
                    left: position.x,
                    top: position.y,
                    touchAction: "none",
                  }}
                >
                  <div className="flex h-11 items-center justify-between rounded-t-xl border-b border-white/[0.08] bg-[#1a1a1a] px-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-[#ffcf66]">
                        {table.schema ? `${table.schema}.` : ""}
                        {table.name}
                      </p>
                      <p className="text-[10px] text-[#888]">{table.columns.length} columns</p>
                    </div>
                  </div>

                  <div className="space-y-1 px-3 py-2">
                    {table.columns.slice(0, 8).map((column) => (
                      <div
                        key={`${table.id}-${column.name}`}
                        className="grid grid-cols-[1fr_auto] gap-2 text-[10px] text-[#cecece]"
                      >
                        <p className="truncate">
                          {column.isPrimary ? "PK " : ""}
                          {column.name}
                        </p>
                        <p className="truncate text-right text-[#7f7f7f]">{column.type}</p>
                      </div>
                    ))}
                    {table.columns.length > 8 && (
                      <p className="pt-1 text-[10px] text-[#7f7f7f]">
                        +{table.columns.length - 8} more columns
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {floatingNodes.map((floating) => {
              const position = activeWorkspace?.nodePositions[floating.id];
              if (!position) return null;
              const suggestions = floatingSuggestionMap.get(floating.label) || [];

              return (
                <div
                  key={floating.id}
                  data-schema-node="true"
                  onPointerDown={(event) => handleNodePointerDown(floating.id, event)}
                  className={cn(
                    "absolute rounded-xl border border-dashed border-amber-400/50 bg-amber-400/10 px-3 py-2 shadow-[0_12px_26px_rgba(0,0,0,0.38)]",
                    draggingNodeId === floating.id
                      ? "ring-2 ring-amber-300/45"
                      : "hover:border-amber-300/70",
                  )}
                  style={{
                    width: FLOATING_WIDTH,
                    height: FLOATING_HEIGHT,
                    left: position.x,
                    top: position.y,
                    touchAction: "none",
                  }}
                >
                  <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">
                    <Link2Off className="h-3 w-3" />
                    unresolved target
                  </p>
                  <p className="mt-1.5 truncate font-mono text-xs text-amber-100">{floating.label}</p>
                  {suggestions.length > 0 && (
                    <p className="mt-1 truncate text-[10px] text-amber-200/85">
                      likely: {suggestions.join(" · ")}
                    </p>
                  )}
                </div>
              );
            })}

            {activeWorkspace &&
              activeWorkspace.graph.tables.length === 0 &&
              activeWorkspace.graph.floatingTargets.length === 0 && (
                <div className="absolute left-[48%] top-[43%] max-w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-dashed border-white/[0.16] bg-black/55 px-5 py-4 text-center">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#ffcf66]">
                    <Database className="h-4 w-4" />
                    Waiting for SQL files
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-[#939393]">
                    Upload one file first, then add another to trigger related/unrelated workspace branching.
                  </p>
                </div>
              )}
          </div>

          <div data-canvas-control="true" className="pointer-events-none absolute left-3 right-3 top-3 z-30 flex flex-wrap items-start justify-between gap-3">
            {/* Left Header Group (Toggle + Viz Label + Tabs) */}
            <div className="flex flex-wrap items-center gap-2 pointer-events-auto shrink min-w-0">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="h-10 w-10 shrink-0 rounded-xl border-white/[0.12] bg-[#111] shadow-xl text-[#dadada] hover:bg-white/[0.08]"
                onClick={() => setLeftPanelOpen((prev) => !prev)}
                title={leftPanelOpen ? "Collapse workspace controls" : "Open workspace controls"}
              >
                {leftPanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
              </Button>
              
              <div className="flex shrink-0 items-center gap-2 rounded-xl border border-[#ffb4004d] bg-[#111] px-3 h-10 shadow-xl">
                <BarChart3 className="h-4 w-4 text-[#f9ca73]" />
                <span className="text-xs font-semibold tracking-wider text-[#f9f9f9]">SQL VIZ</span>
              </div>

              <div className="hidden md:flex items-center gap-2 overflow-x-auto rounded-xl border border-white/[0.1] bg-[#111] px-2 h-10 shadow-xl shrink min-w-0 flex-1 max-w-[600px]">
                {workspaces.map((workspace) => {
                  const active = workspace.id === activeWorkspaceId;
                  return (
                    <div
                      key={workspace.id}
                      className={cn(
                        "inline-flex items-center rounded-full border pr-1 transition-colors shrink-0",
                        active
                          ? "border-[#ffb40055] bg-[#ffb40015] text-[#ffcf66]"
                          : "border-white/[0.12] bg-white/[0.02] text-[#8d8d8d]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveWorkspaceId(workspace.id)}
                        className="px-3 py-1 text-xs truncate max-w-[124px]"
                        title={`${workspace.graph.tables.length} tables · ${workspace.files.length} files`}
                      >
                        {workspace.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => closeWorkspace(workspace.id)}
                        className={cn(
                          "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                          active ? "text-[#ffd783] hover:bg-[#ffb40020]" : "text-[#7d7d7d] hover:bg-white/[0.06]",
                        )}
                        title={`Close ${workspace.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
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
                  className="inline-flex items-center shrink-0 gap-1 rounded-full border border-dashed border-white/[0.18] px-3 py-1 text-xs text-[#8d8d8d] hover:border-[#ffb40045] hover:text-[#ffcf66]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Schema
                </button>
              </div>
            </div>

            {/* Right Header Group (Stats + Zoom) */}
            <div className="flex items-center gap-3 pointer-events-auto shrink-0 flex-wrap justify-end">
              <div className="hidden items-center gap-1.5 text-xs lg:flex">
                <div className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#111] shadow-xl px-3 h-10">
                  <span className="text-[#888]">Tables</span>
                  <span className="font-semibold text-white">{activeWorkspace?.graph.tables.length || 0}</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#111] shadow-xl px-3 h-10">
                  <span className="text-[#888]">Cols</span>
                  <span className="font-semibold text-white">{totalColumns}</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#111] shadow-xl px-3 h-10">
                  <span className="text-[#888]">Links</span>
                  <span className="font-semibold text-white">{activeWorkspace?.graph.edges.length || 0}</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#111] shadow-xl px-3 h-10">
                  <span className="text-[#888]">Float</span>
                  <span className="font-semibold text-[#f6b54f]">{unresolvedCount}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#111] shadow-xl px-1.5 h-10">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="h-7 w-7 border-white/[0.12] bg-[#222] text-[#d0d0d0] hover:bg-white/10"
                  onClick={() => setZoom((prev) => Math.max(0.45, prev - 0.1))}
                  title="Zoom out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="h-7 w-7 border-white/[0.12] bg-[#222] text-[#d0d0d0] hover:bg-white/10"
                  onClick={() => setZoom((prev) => Math.min(1.8, prev + 0.1))}
                  title="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-7 border-white/[0.12] bg-[#222] px-2.5 text-xs text-[#d0d0d0] hover:bg-white/10"
                  onClick={() => {
                    setPan({ x: 120, y: 130 });
                    setZoom(0.85);
                  }}
                >
                  Reset
                </Button>
              </div>
            </div>
          </div>

          {leftPanelOpen && (
            <div data-canvas-control="true" className="absolute left-3 top-[228px] bottom-[102px] z-30 w-[312px] rounded-2xl border border-white/[0.09] bg-black/55 p-3 backdrop-blur-md md:top-[132px]">
              <div className="h-full overflow-auto pr-1">
                <section className="rounded-xl border border-white/[0.08] bg-black/35 p-3">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#9f9f9f]">Schema Input</h2>
                  <p className="mb-2 text-xs text-[#888]">
                    Upload SQL/Snowflake files. Floating links stay visible and can still suggest likely table targets.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-full justify-center border-white/[0.12] bg-black/35 text-[#ddd] hover:bg-white/5"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload SQL Files
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".sql,.txt,.ddl,.snowflake,.md"
                    multiple
                    className="hidden"
                    onChange={handleNativeFileSelection}
                  />

                  <div className="mt-3 space-y-2">
                    <Input
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      placeholder="snippet.sql"
                      className="h-8 bg-white/[0.03] text-xs text-white"
                    />
                    <Textarea
                      value={sqlDraft}
                      onChange={(event) => setSqlDraft(event.target.value)}
                      placeholder="Paste SQL DDL, references, joins..."
                      className="min-h-[126px] resize-y bg-white/[0.03] text-xs leading-relaxed text-[#f0f0f0]"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 w-full border-white/[0.12] text-xs text-[#ddd] hover:bg-white/5"
                      onClick={handleAddSqlDraft}
                    >
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      Add SQL Snippet
                    </Button>
                  </div>
                </section>

                <section className="mt-3 rounded-xl border border-white/[0.08] bg-black/35 p-3">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#9f9f9f]">Session</h2>
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 border-white/[0.12] bg-black/35 text-xs text-[#ddd] hover:bg-white/5"
                      onClick={handleCopySchemaContext}
                    >
                      Copy Context Snapshot
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 border-red-500/30 bg-red-500/5 text-xs text-red-200 hover:bg-red-500/15"
                      onClick={handleResetSavedSessions}
                    >
                      Reset Saved Sessions
                    </Button>
                  </div>
                </section>

                <section className="mt-3 rounded-xl border border-white/[0.08] bg-black/35 p-3">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#9f9f9f]">Loaded Files</h2>
                  {activeWorkspace && activeWorkspace.files.length > 0 ? (
                    <div className="max-h-52 space-y-2 overflow-auto pr-1">
                      {activeWorkspace.files.map((file) => (
                        <div key={file.id} className="rounded-lg border border-white/[0.06] bg-black/25 px-2.5 py-2">
                          <p className="truncate text-xs font-medium text-[#e8e8e8]">{file.name}</p>
                          <p className="mt-0.5 text-[11px] text-[#767676]">{file.content.length.toLocaleString()} chars</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-white/[0.1] px-3 py-3 text-xs text-[#787878]">
                      No files loaded in this schema window.
                    </p>
                  )}
                </section>

                {activeWorkspace && activeWorkspace.graph.diagnostics.length > 0 && (
                  <section className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-300">Parser Notes</p>
                    <div className="space-y-1 text-xs text-amber-100/80">
                      {activeWorkspace.graph.diagnostics.slice(0, 10).map((diagnostic) => (
                        <p key={diagnostic}>• {diagnostic}</p>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}

          <div data-canvas-control="true" className="pointer-events-none absolute left-[132px] top-[76px] z-30 hidden md:block">
            <div className="pointer-events-auto flex items-center gap-2 text-xs text-[#8d8d8d]">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                <Link2 className="h-3 w-3" />
                known links
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-amber-300">
                <Link2Off className="h-3 w-3" />
                floating links
              </span>
            </div>
          </div>

          <div data-canvas-control="true" className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
            <div className="pointer-events-auto w-full max-w-4xl">
              <InputBar
                onSend={handleAskSchema}
                placeholder="Ask this schema: joins, constraints, missing indexes, migration risks..."
                textOnlyModels
              />
            </div>
          </div>
        </div>

      <Dialog
        open={Boolean(pendingDecision)}
        onOpenChange={(open) => {
          if (!open) setPendingDecision(null);
        }}
      >
        <DialogContent className="max-w-lg border border-white/[0.15] bg-[#0b0b0b] text-white" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-base text-[#ffcf66]">Is this upload related to this schema window?</DialogTitle>
            <DialogDescription className="text-sm text-[#b8b8b8]">
              Related merges into the current window. Unrelated opens a new SQL schema window.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-white/[0.1] bg-black/35 p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.12em] text-[#7d7d7d]">Queued Files</p>
            <div className="space-y-1.5 text-xs text-[#ddd]">
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
                className="border-white/[0.14] bg-white/[0.02] text-[#e0e0e0] hover:bg-white/[0.07]"
                onClick={() => handleDecision(true)}
              >
                Related: Merge into current
              </Button>
              <Button
                type="button"
                className="bg-[#ffb400] text-black hover:bg-[#e2a100]"
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
