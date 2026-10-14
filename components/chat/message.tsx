"use client";

import { memo, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  ChevronDown,
  Copy,
  Check,
  FileText,
  Paperclip,
  Code,
  Table,
  Image as ImageIcon,
  PencilLine,
  RotateCcw,
  X as XIcon,
  ThumbsUp,
  ThumbsDown,
  Download,
  Eye,
  EllipsisIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn, compactWhitespace } from "@/lib/utils";
import { fixJson } from "@/lib/fix-json";
import { hydrateMessageImages } from "@/lib/image-cache";
import type { ArtifactKind, ChatMessage } from "@/lib/types";
import { useActiveChat } from "@/hooks/use-active-chat";
import { StreamingText } from "./leopard/streaming-text";
import type { ReasoningLevel } from "@/lib/nim";
import { ReasoningPanel } from "./leopard/reasoning-panel";
import { ThinkingIndicator } from "./leopard/thinking-indicator";
import { ToolCall } from "./leopard/tool-call";
import { GuardrailNotice } from "./leopard/guardrail-notice";
import { ToolError } from "./leopard/tool-error";
import { ToolRunGroup } from "./leopard/tool-run-group";
import { AgentRunCard, type AgentRunState } from "./leopard/agent-run-card";
import { MessageActions } from "./leopard/message-actions";
import { ArtifactCard } from "./leopard/artifact-card";
import { Sources, type SourceItem } from "./leopard/sources";
import {
  createDirectiveText,
  type DirectiveTextFormatter,
  type DirectiveTextSegment,
} from "./leopard/directive-text";

// User-bubble mention chips: the composer inserts @-mentions as plain
// `@Title ` text (composer.tsx applyMention), so the bubble re-chips
// `@Token` runs via the forked directive-text formatter. Whitespace ends a
// mention (titles with spaces chip only the first word — plain-text mention
// format carries no span info).
const mentionFormatter: DirectiveTextFormatter = {
  parse(text) {
    const segs: DirectiveTextSegment[] = [];
    const re = /@(\S+)/g;
    let last = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (m.index > last) segs.push({ kind: "text", text: text.slice(last, m.index) });
      segs.push({ kind: "mention", type: "chat", label: `@${m[1]}`, id: m[1] });
      last = m.index + m[0].length;
    }
    if (last < text.length) segs.push({ kind: "text", text: text.slice(last) });
    return segs;
  },
};
const UserText = createDirectiveText(mentionFormatter);
import { EditMessage } from "./leopard/edit-message";
import { RegenerateMenu, type RegenerateOption } from "./leopard/regenerate-menu";
import { ReadAloudButton } from "./leopard/read-aloud";
import { QuoteReply } from "./leopard/quote-reply";
import { FeedbackDialog } from "./leopard/feedback-dialog";
import { MessageBranches } from "./leopard/message-branches";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ghostButton } from "./leopard/surfaces";
import { ImageLightbox } from "./leopard/image-lightbox";
import { WidgetRenderer } from "./leopard/widget-renderer";
import { getActiveModels } from "@/lib/ai/models";

// ────────────────────────────────────────────────────────────────────────────
// Φ7 (action buttons). All "real" — wiring goes to the chat SDK + persistence,
// not just cosmetic hovers. Toolbar shape:
//   USER     : Copy · Edit (turns this message into the composer text + truncates
//              everything after so the next send replaces it)
//   ASSISTANT: Copy · Regenerate (re-triggers the AI for this turn) · Like ·
//              Dislike (persists a vote per message id in localStorage). Last
//              vote highlighted amber.
// Order of buttons is the visual hierarchy Apple / Linear prefer:
//   - Copy (neutral, primary edit affordance) sits leftmost
//   - Edit/Regenerate (destructive-ish, the "I want this different" lever)
//     sits next
//   - Like/Dislike (pure signal, non-action) sit furthest right
// ─────────────────────────────────────────────────────────────────────────────
function feedbackStore(messageId: string): "up" | "down" | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(`lf:fb:${messageId}`);
    if (v === "up" || v === "down") return v;
  } catch {
    /* private mode */
  }
  return null;
}
function setFeedback(messageId: string, value: "up" | "down") {
  try {
    window.localStorage.setItem(`lf:fb:${messageId}`, value);
  } catch {
    /* swallow */
  }
}

/**
 * Phase 5 + Φ6 message renderer — text + reasoning + tool-createDocument parts
 * (AI SDK v6 UIMessage). tool-createDocument parts render as an inline
 * "Document created" card (the artifact opener); clicking reopens the side
 * panel (the panel rehydrates content from Convex via api.documents.getLatest
 * — see artifact-panel.tsx). image / file parts still deferred.
 *
 * Φ8: assistant image-gen markdown hydrates from IndexedDB — the persisted
 * Convex parts carry `#img-${id}` placeholders (use-active-chat sanitizes on
 * save to keep base64/data-urls out of the row); hydrateMessageImages swaps
 * them back via localforage. No-op for non-image text (returns content
 * unchanged). During the FIRST stream the text carries the real URL directly
 * (sanitize only runs at persist/ready), so live render is unaffected.
 *
 * User messages render right-aligned in the amber-gradient block (leopard
 * idiom); assistant messages render full-width with a collapsible reasoning
 * block + markdown body + streaming cursor + hover copy + the doc card.
 */

/** Concatenate all `text` parts of a UIMessage into a single string. */
export function getMessageText(message: ChatMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("");
}

/** Concatenate all `reasoning` parts (model thinking). */
// Session-scoped cache of frozen reasoning durations, keyed by reasoning-text
// prefix — survives the optimistic→persisted message-id remount so the settled
// panel keeps "Thought for Ns" (see Message's reasoning tracker).
// Bounded (audit 2026-10-08): unbounded growth over a long session. FIFO-evict
// past 200 entries (Map preserves insertion order).
const reasoningElapsedCache = new Map<string, number>();
function cacheReasoningElapsed(key: string, ms: number): void {
  if (reasoningElapsedCache.has(key)) reasoningElapsedCache.delete(key);
  reasoningElapsedCache.set(key, ms);
  if (reasoningElapsedCache.size > 200) {
    const oldest = reasoningElapsedCache.keys().next().value;
    if (oldest !== undefined) reasoningElapsedCache.delete(oldest);
  }
}

function getMessageReasoning(message: ChatMessage): string {
  return message.parts
    .filter((p) => p.type === "reasoning")
    .map((p) => (p as { text: string }).text)
    .join("\n")
    .trim();
}

/** Shape of a persisted/streaming `tool-createDocument` UIMessage part. */
type DocToolOutput = {
  id: string;
  title: string;
  kind: ArtifactKind;
  content?: string;
};
type DocToolPart = {
  type: "tool-createDocument";
  state: string; // "input-streaming" | "input-available" | "output-available"
  input?: Partial<DocToolOutput> & { isUpdate?: boolean };
  output?: DocToolOutput;
};

const KIND_ICON: Record<ArtifactKind, typeof FileText> = {
  text: FileText,
  code: Code,
  sheet: Table,
  image: ImageIcon,
  file: FileText,
};

/**
 * Φ-multi-agent: reduce the spawn_agents tool call + its data-orchestration
 * snapshots into the AgentRunCard's state. Before the first snapshot lands
 * (or on a reload where only the tool part persisted), agents come from the
 * tool INPUT's task list; a settled tool call (output with per-agent results)
 * wins over both.
 */
function toAgentRunState(
  snap: { agents: AgentRunState["agents"] } | undefined,
  input: unknown,
  state: string,
  output: unknown,
): AgentRunState {
  const done = state === "complete";
  const outAgents = (
    output as
      | { agents?: Array<{ name: string; kind: string; status: string; note?: string; durationMs?: number }> }
      | undefined
  )?.agents;
  if (outAgents?.length) {
    return {
      agents: outAgents.map((a) => ({
        name: a.name,
        kind: (a.kind as AgentRunState["agents"][number]["kind"]) ?? "general",
        task: "",
        status: (a.status as AgentRunState["agents"][number]["status"]) ?? "done",
        note: a.note,
        durationMs: a.durationMs,
      })),
      done,
    };
  }
  if (snap) {
    // Stamp startedAt on the running transition — the per-agent wall-clock
    // reads it (was never set, so the timer showed nothing while the card
    // re-rendered every second anyway).
    return {
      agents: snap.agents.map((a) =>
        a.status === "running" && a.startedAt === undefined
          ? { ...a, startedAt: Date.now() }
          : a,
      ),
      done,
    };
  }
  const tasks =
    (input as { tasks?: Array<{ name: string; kind: string; task: string }> } | undefined)?.tasks ?? [];
  return {
    agents: tasks.map((t) => ({
      name: t.name,
      kind: (t.kind as AgentRunState["agents"][number]["kind"]) ?? "general",
      task: t.task,
      status: done ? "done" : "pending",
    })),
    done,
  };
}

/** MIME type for a filename's extension, so the Download Blob is typed. */
function mimeForFilename(filename: string): string {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const map: Record<string, string> = {
    md: "text/markdown",
    txt: "text/plain",
    json: "application/json",
    csv: "text/csv",
    yaml: "text/yaml",
    yml: "text/yaml",
    toml: "text/plain",
    py: "text/x-python",
    js: "text/javascript",
    mjs: "text/javascript",
    ts: "text/plain",
    tsx: "text/plain",
    jsx: "text/plain",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    xml: "application/xml",
    svg: "image/svg+xml",
  };
  return map[ext] ?? "text/plain";
}

/** Trigger a client-side file download from assembled content. */
function downloadFile(filename: string, content: string): void {
  if (!content) return;
  const blob = new Blob([content], { type: mimeForFilename(filename) });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.split("/").pop() ?? filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Derive a short file-type label from the filename's extension. */
function extensionOf(filename: string): string {
  const ext = (filename.split(".").pop() ?? "").trim();
  return ext ? ext.toUpperCase() : "";
}

/**
 * Inline FILE CARD — the downloadable/previewable card rendered in the
 * transcript under the assistant reply for each `tool-createDocument` part.
 * After the stream finishes (state "output-available") it shows the file icon,
 * filename (title with extension), kind/extension label, and Preview + Download
 * buttons. Preview opens a themed modal showing the raw text content; Download
 * builds a Blob with the correct MIME + filename and saves it.
 *
 * Content is NOT re-assembled here — the client's data-stream handler already
 * assembled it and persisted it to Convex via `api.documents.save` on
 * `data-finish` (see use-active-chat onData). This card reads that stored doc
 * via `api.documents.getLatest` keyed by the part's output.id (the same uuid
 * the tool minted + the client persisted under), so nothing is double-stored.
 * The title region still opens the side ArtifactPanel (existing behavior).
 */
function DocumentCard({ part, live }: { part: DocToolPart; live: boolean }) {
  const { setArtifact } = useActiveChat();
  const [previewOpen, setPreviewOpen] = useState(false);
  // Hooks run unconditionally (React rules): the getLatest query belongs above
  // the provisional "creating…" early-return so hook count stays stable when the
  // part flips from streaming → output-available. Reads the client-persisted doc
  // keyed by the exact id the tool minted (part.output?.id === Convex id); while
  // still streaming, docId is undefined → args "skip" → no query issued.
  const docId = part.output?.id;
  const fetched = useQuery(api.documents.getLatest, docId ? { id: docId } : "skip");
  const content = fetched?.content ?? "";

  // Streaming / not-yet-complete → generating card ONLY while the turn is
  // live (audit 2026-10-09: a reload/stop mid-document left the persisted
  // input-streaming part rendering "Writing…" forever). Settled + no output =
  // interrupted → neutral chip, same contract as the stale-pending tool path.
  if (part.state !== "output-available" || !part.output) {
    if (!live) {
      return (
        <div className="my-2 inline-flex items-center gap-2 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-1.5 text-[12px] text-foreground/50">
          <span className="font-mono text-[10px] uppercase tracking-wide">interrupted</span>
          <span className="font-medium">{part.input?.title ?? "document"}</span>
          — the turn stopped before it finished
        </div>
      );
    }
    return (
      <ArtifactCard
        className="mt-3"
        title={part.input?.title ?? "document"}
        meta=""
        generating
        words={0}
      />
    );
  }

  const { id, title, kind } = part.output;
  const Icon = KIND_ICON[kind] ?? FileText;
  const extLabel = extensionOf(title) || kind;

  const handleOpen = () => {
    // Seed metadata; the panel rehydrates the same Convex doc (artifact-panel).
    setArtifact({
      documentId: id,
      title,
      kind,
      content: "",
      status: "idle",
      isVisible: true,
    });
  };

  return (
    <>
      <div className="group/card mt-3 w-full sm:max-w-sm overflow-hidden rounded-lg border dark:border-white/[0.08] light:border-black/[0.08] dark:bg-white/[0.02] light:bg-black/[0.015] transition-colors">
        <ArtifactCard
          title={title || "Untitled"}
          meta={`${extLabel} · ${content ? `${(content.length / 1024).toFixed(1)} KB` : "created"}`}
          onClick={handleOpen}
          className="max-w-none rounded-none border-0"
        />

        <div className="flex items-center gap-1 border-t px-2.5 py-1.5 dark:border-white/[0.05] light:border-black/[0.06]">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            disabled={!content}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-mono dark:text-[#505050] light:text-[#737373] hover:dark:text-[#e5e5e5] hover:light:text-[#1d1d1f] hover:dark:bg-white/[0.05] hover:light:bg-black/[0.03] disabled:opacity-40 transition-colors"
          >
            <Eye className="h-3 w-3" /> Preview
          </button>
          <button
            type="button"
            onClick={() => downloadFile(title || "file", content)}
            disabled={!content}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-mono dark:text-[#505050] light:text-[#737373] hover:dark:text-[#ffb400] hover:light:text-[#d49600] hover:dark:bg-[#ffb400]/[0.06] hover:light:bg-[#ffb400]/[0.08] disabled:opacity-40 transition-colors"
          >
            <Download className="h-3 w-3" /> Download
          </button>
        </div>
      </div>

      {/* Preview modal — themed overlay showing the raw file text in mono. */}
      {previewOpen && content && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title || "Preview"}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          onClick={() => setPreviewOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setPreviewOpen(false)}
          ref={(el) => el?.focus()}
          tabIndex={-1}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border dark:border-white/15 light:border-black/10 dark:bg-[#0a0a0a] light:bg-[#faf8f1] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3 dark:border-white/[0.08] light:border-black/[0.08]">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md dark:bg-[#ffb400]/10 light:bg-[#ffb400]/15">
                  <Icon className="h-3.5 w-3.5 text-[#ffb400]" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-body font-medium dark:text-[#e5e5e5] light:text-[#262626]">
                    {title || "Untitled"}
                  </h3>
                  <span className="text-[10px] font-mono uppercase tracking-tighter dark:text-[#606060] light:text-[#8a8a8a]">
                    {extLabel} · {content.length.toLocaleString()} chars
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close preview"
                onClick={() => setPreviewOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg dark:text-[#505050] light:text-[#737373] hover:dark:text-[#e5e5e5] hover:light:text-[#262626] hover:dark:bg-white/[0.06] hover:light:bg-black/[0.04] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#ffb400]/60"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre-wrap break-words px-5 py-4 text-[13px] leading-[1.6] font-mono dark:text-[#cfcfcf] light:text-[#262626]">
              {content}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}

const EFFORT_LABEL: Record<ReasoningLevel, string> = {
  off: "Off",
  on: "On",
  low: "Low",
  medium: "Medium",
  high: "High",
  max: "Max",
};

/**
 * Reasoning card — auto-opens while reasoning streams, auto-collapses once the
 * answer text begins (or the stream ends). Local click toggle persists across
 * stream transitions. The block is non-glass content, not a popover: amber
 * stays on the Brain accent only; the card surface is a faint amber-washed
 * gradient so the reasoning reads as "this thinking belongs to the message"
 * rather than as a banner. Reasoning text renders as markdown via StreamItDown
 * (plain during streaming → syntax-highlighted once the answer lands).
 */

// Φ10 web tool card — an inline, expandable card documenting a webSearch /
// webFetch call, styled to match the thinking card (same chroma, same
// shimmer, same collaborate-on-stream feel). Header reads like the reasoning
// one: a small MESH GLOBE (wireframe sphere) inline + "calling webFetch: url"
// while live, then "Fetched [url] · 0.8s" once it completes. Expandable to
// inspect input (query/url) + output summary.
function ToolCard({
  toolName,
  state,
  input,
  output,
}: {
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
}) {
  const [open, setOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const isSearch = toolName === "webSearch";
  const pending = state === "streaming" || state === "pending" || state === "loading";
  // An explicit error state (incl. a stale-pending call settled by the parent
  // when the turn died) renders failed even without an error payload.
  const stateFailed = state === "error";
  const TOOL_VERB: Record<string, string> = {
    webFetch: "Fetching",
    webSearch: "Searching the web",
    createDocument: "Creating document",
  };
  const verb = isSearch ? "searching web" : (TOOL_VERB[toolName] ?? toolName);

  // No elapsed clock on tool cards — time chips live on the reasoning panel
  // header only (user directive 2026-08-26).

// Human-readable summary of what the tool did (query string / url host path).
  let summary = "";
  if (isSearch && input && typeof input === "object") {
    const q = (input as { query?: string }).query;
    if (q) summary = q;
  } else if (!isSearch && input && typeof input === "object") {
    const u = (input as { url?: string }).url;
    if (typeof u === "string") summary = u.replace(/^https?:\/\//, "");
  }
  // Result line for the open state.
  let resultLine = "";
  let resultOk = !stateFailed;
  if (isSearch && output && typeof output === "object") {
    const res = (output as { results?: Array<{ url?: string; title?: string }> }).results;
    if (Array.isArray(res)) {
      resultOk = res.length > 0;
      const top = res[0];
      if (top) resultLine = top.title || top.url || "";
      if (res.length > 1) resultLine += ` (+${res.length - 1} more)`;
    } else if ((output as { error?: string }).error) {
      resultLine = (output as { error: string }).error;
      resultOk = false;
    }
  } else if (!isSearch && output && typeof output === "object") {
    const o = output as { status?: number; truncated?: boolean; bytes_read?: number; error?: string };
    if (o.error) {
      resultLine = o.error;
      resultOk = false;
    } else resultLine = `HTTP ${o.status} · ${o.bytes_read ?? 0} B` + (o.truncated ? " (truncated)" : "");
  }

  const copyUrl = () => {
    if (!isSearch && summary) {
      navigator.clipboard.writeText((input as { url?: string }).url ?? summary);
      setCopiedUrl(true);
      toast.success("Copied URL");
      setTimeout(() => setCopiedUrl(false), 1600);
    }
  };

  const urlLabel = isSearch ? "search" : "url";

  // ── Leopard ToolCall (forked kit element) — quiet trigger row with a live
  // shimmer label while running, resting past-tense label + elapsed mono chip
  // when done, and a field-surface Request/Result disclosure. Failed rounds
  // tint the label red instead of the green check.
  const requestStr = (() => {
    if (input == null) return summary;
    try {
      const s = JSON.stringify(input);
      return s.length > 400 ? s.slice(0, 400) + "…" : s;
    } catch {
      return summary;
    }
  })();
  return (
    <ToolCall
      className="max-w-none"
      label={
        pending
          ? `${verb}…`
          : resultOk
            ? isSearch
              ? "Searched the web"
              : (
                  {
                    webFetch: "Fetched",
                    createDocument: "Created",
                  } as Record<string, string>
                )[toolName] ?? toolName
            : `${verb} failed`
      }
      activeLabel={`${verb}…`}
      query={summary}
      request={requestStr}
      result={resultLine || (resultOk ? "Done" : "Failed")}
      requestData={input}
      resultData={output}
      running={pending}
      failed={!pending && !resultOk}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

// Short target label for a grouped tool row (query / bare URL) — mirrors the
// summary ToolCard computes for its trigger.
function toolTarget(toolName: string, input: unknown): string {
  if (input && typeof input === "object") {
    if (toolName === "webSearch") {
      return (input as { query?: string }).query ?? "";
    }
    const u = (input as { url?: string }).url;
    if (typeof u === "string") return u.replace(/^https?:\/\//, "");
  }
  return "";
}

// Models occasionally leak Hermes-style tool DSL or the raw spawn_agents
// input JSON into TEXT when a tool call misfires — never render either
// (the "json code block instead of a card" bug, 2026-09-01).
const stripToolDsl = (t: string): string =>
  t.replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/g, "").trim();
const isRawTasksJson = (t: string): boolean => {
  const c = t.trim().replace(/^```(?:json)?|```$/g, "").trim();
  if (!c.startsWith("{") || !c.includes('"tasks"')) return false;
  try {
    return Array.isArray((JSON.parse(c) as { tasks?: unknown }).tasks);
  } catch {
    return false;
  }
};

// Refusal heuristic — matches an answer that opens with a decline phrase.
const REFUSAL_RE =
  /^\s*(?:i\s+(?:can'?t|cannot|can\s+not|won'?t|must\s+decline)|i'?m\s+sorry|sorry,?\s+i\s+(?:can'?t|cannot))/i;
// Strip leading image/link markdown + whitespace before testing (audit
// 2026-10-09, deep-sweep #14): an answer opening with an embedded image hid
// the refusal note because ^ anchored against the image tag.
const isRefusal = (text: string) =>
  REFUSAL_RE.test(text.replace(/^(\s*!?\[[^\]]*\]\([^)]*\)\s*)+/, ""));

export const PreviewMessage = memo(function PreviewMessage({
  message,
  isLast,
  status,
  hideSpawnCard = false,
  hideReasoning = false,
}: {
  message: ChatMessage;
  isLast: boolean;
  status: string;
  // Approval-resume fork: this bubble's reasoning is superseded by the resume
  // bubble's fresh reasoning — hide the panel (tool cards still render).
  hideReasoning?: boolean;
  // Φ-multi-agent: one AgentRunCard per TURN. The approval→resume flow can
  // leave the spawn_agents tool part on two messages (the pre-approval
  // assistant row + the resumed row) — messages.tsx passes hideSpawnCard to
  // every spawn-bearing message except the LAST, so the card renders once.
  hideSpawnCard?: boolean;
}) {
  const isUser = message.role === "user";
  const text = getMessageText(message);
  // QA M2: user attachments ride as `file` parts (data-URL inline) — the
  // bubble used to render text only, so images/files vanished after send.
  const userFileParts = isUser
    ? (message.parts.filter((p) => p.type === "file") as Array<{
        url: string;
        filename?: string;
        mediaType?: string;
      }>)
    : [];
  const reasoning = !isUser && !hideReasoning ? getMessageReasoning(message) : "";
  const isStreaming = !isUser && isLast && status === "streaming";
  // Φ6: tool-createDocument parts → inline artifact-opener cards (see
  // DocumentCard). Empty for user msgs; assistant msgs get one per tool call.
  const docParts = !isUser
    ? (message.parts.filter(
        (p) => p.type === "tool-createDocument",
      ) as unknown as DocToolPart[])
    : [];
  // Generative UI: tool-renderWidget parts → inline interactive widgets.
  const widgetParts = !isUser
    ? message.parts.filter((p) => p.type === "tool-renderWidget")
    : [];
  // Effort badge source: the per-model client-persisted reason level. The UIMessage
  // parts carry only reasoning text (no effort field), so the badge reflects the
  // active chat's current setting — same as the input-bar ReasoningControl.
  // Φ7 (action buttons): also pull chat helpers — messages / setMessages for
  // Edit+truncate; reload for Regenerate; messages list is exposed by the
  // standard AI SDK v6 UseChatHelpers return value.
  const chat = useActiveChat();
  const { currentReasoning } = chat;
  // Suggested follow-up chips (ephemeral, set by use-active-chat after the
  // assistant stream finishes). Tap → populates the composer.
    const [copiedUser, setCopiedUser] = useState(false);
  const [copied, setCopied] = useState(false);
  // Φ11 forks: inline user edit / regen model menu / thumbs-down dialog.
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  // Tool-error cards dismissed via Skip (segment index) — hidden, not deleted.
  const [dismissedToolErr, setDismissedToolErr] = useState<ReadonlySet<number>>(new Set());
  const [regenOpen, setRegenOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackReasons, setFeedbackReasons] = useState<string[]>([]);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const quoteRootRef = useRef<HTMLDivElement>(null);
  const [feedbackVote, setFeedbackVote] = useState<"up" | "down" | null>(() =>
    feedbackStore(message?.id ?? ""),
  );
  // Regen history (session-scoped, from use-active-chat) + stream duration.
  const siblings = isUser ? [] : chat.getSiblings(message.id);
  const [branchIdx, setBranchIdx] = useState<number | null>(null); // null = latest
  // Browsing a branch SWAPS the main content (aui pattern) — the navigator
  // used to render the picked variant as a plain-text duplicate BELOW the
  // live reply (audit 2026-10-12: regenerate → the same answer twice).
  const browsingBranch =
    branchIdx !== null && branchIdx >= 0 && branchIdx < siblings.length;
  const branchText = browsingBranch ? siblings[branchIdx] : null;
  // (Whole-run timing display removed 2026-09-02 — see reasoning panel.)
  // Reasoning panel open overrides — keyed by segment index. Default is
  // derived (`live`): completed cards default collapsed, live ones open; an
  // explicit click wins. (Keeps the stale-card fix: no mount-time open state.)
  const [reasoningOpen, setReasoningOpen] = useState<Record<number, boolean>>(
    {},
  );
  // Feedback dialog: Escape closes (backdrop click + Cancel already do).
  useEffect(() => {
    if (!feedbackOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setFeedbackOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [feedbackOpen]);
  useEffect(() => {
    // Re-read vote if message.id changes (e.g. after streaming completes and
    // the optimistic id gets swapped for the persisted one).
    setFeedbackVote(feedbackStore(message?.id ?? ""));
  }, [message?.id]);
  // Reasoning elapsed tracker: start the clock when reasoning first appears,
  // freeze once the answer text begins (or the stream ends) → "Thought for Ns".
  // The frozen value is stashed in a module-level map keyed by reasoning-text
  // prefix: the optimistic→persisted message-id swap REMOUNTS this component,
  // which would otherwise lose the ref/state and fall back to the bare
  // "Thought process" label after settle.
  const reasoningStartRef = useRef<number | null>(null);
  const [reasoningMs, setReasoningMs] = useState<number | undefined>(() => {
    // Persisted duration (stamped server-side into the reasoning part) wins —
    // it survives reload; the session cache only covers the id-swap remount.
    const persisted = message?.parts?.find(
      (p) =>
        p?.type === "reasoning" &&
        typeof (p as { durationMs?: unknown }).durationMs === "number",
    ) as { durationMs?: number } | undefined;
    if (persisted?.durationMs !== undefined) return persisted.durationMs;
    return reasoning ? reasoningElapsedCache.get(reasoning.slice(0, 64)) : undefined;
  });
  useEffect(() => {
    if (isUser || !reasoning) {
      reasoningStartRef.current = null;
      return;
    }
    // Start the clock the moment reasoning exists while streaming —
    // regardless of whether text already arrived. (Old `&& !text` guard
    // missed fast batches where reasoning+text land in the same render.)
    if (reasoningStartRef.current === null && isStreaming) {
      if (reasoningMs === undefined) {
        reasoningStartRef.current = performance.now();
      }
      return;
    }
    if (reasoningStartRef.current !== null && (text || !isStreaming)) {
      const ms = Math.round(performance.now() - reasoningStartRef.current);
      cacheReasoningElapsed(reasoning.slice(0, 64), ms);
      setReasoningMs(ms);
      reasoningStartRef.current = null;
    }
    // reasoningMs intentionally excluded (would loop on every tick).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reasoning, text, isStreaming]);
  // (No response-level timer — elapsed time lives on the reasoning panel's
  // collapsible header only, per user directive 2026-08-26.)

// Φ8: hydrate persisted image placeholders (post-reload) from IndexedDB.
  // Render `text` immediately (no blank), then swap once hydrate resolves.
  // State only exists when the text ACTUALLY carries #img- placeholders —
  // previously a per-token state write ran for plain-text streams, and the
  // queued promise resolves could cascade past React's nested-update limit
  // ("Maximum update depth exceeded" killing the whole turn, 2026-09-02).
  const needsHydrate = text.includes("#img-");
  const [hydrated, setHydrated] = useState<string | null>(null);
  useEffect(() => {
    if (!needsHydrate) return;
    let active = true;
    void hydrateMessageImages(message.id, text).then((h) => {
      if (active) setHydrated((prev) => (h === prev ? prev : h));
    });
    return () => {
      active = false;
    };
  }, [message.id, text, needsHydrate]);
  const renderText = needsHydrate && hydrated !== null ? hydrated : text;

  // Per-message "More" kebab: the
  // ellipsis button existed on MessageActions but was never wired — no way to
  // export a single answer or copy raw markdown. A DropdownMenu with export
  // .md / copy markdown / copy plain text.
  const [moreOpen, setMoreOpen] = useState(false);
  // Image lightbox: full-size preview for attached
  // or generated images — they render bare <img> otherwise (unreadable crop
  // on mobile, no download).
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  // Φ9 interleaved thinking — walk the parts in stream order and collapse
  // consecutive runs into alternating text / reasoning segments. This keeps
  // thought blocks inline at the position where the model actually reasoned
  // (reasoning → answer → second thought = three segments), instead of
  // dumping every thought above the whole answer.
  // Φ10 (web tools): tool-call / tool-result parts become `tool` segments at
  // their stream position, so a search→fetch sequence renders as two inline
  // cards where they happened, not a lump at the top or bottom.
  const segments = useMemo(() => {
    if (isUser) return [] as Array<
      | { kind: "text"; content: string }
      | { kind: "reasoning"; content: string; durationMs?: number }
      | {
          kind: "tool";
          toolName: string;
          state: string;
          input?: unknown;
          output?: unknown;
          approvalId?: string;
          toolCallId?: string;
          orch?: AgentRunState;
        }
    >;
    type Seg = (typeof out)[number];
    const out: Array<
      | { kind: "text"; content: string }
      // durationMs rides the part (server-stamped per segment) so EACH thought
      // block shows its own time — the message-level tracker is only a live
      // fallback (two blocks used to share it → identical "Thought for Ns").
      | { kind: "reasoning"; content: string; durationMs?: number }
      | {
          kind: "tool";
          toolName: string;
          state: string;
          input?: unknown;
          output?: unknown;
          // AskCard state — set while a tool waits on user approval.
          approvalId?: string;
          toolCallId?: string;
          // Φ-multi-agent: reduced data-orchestration state for spawn_agents.
          orch?: AgentRunState;
        }
    > = [];
    // Φ-multi-agent: latest data-orchestration snapshot per toolCallId.
    // Emitted by the spawn_agents tool execute.
    const orchByCall = new Map<string, { agents: AgentRunState["agents"] }>();
    for (const p of message.parts as Array<{ type?: string; data?: unknown }>) {
      if (p.type !== "data-orchestration" || !p.data) continue;
      const ev = p.data as { toolCallId: string; agents: AgentRunState["agents"] };
      orchByCall.set(ev.toolCallId, { agents: ev.agents });
    }
    let cur: Seg | null = null;
    // Indexed loop so an approval-request can look ahead to the matching
    // tool-call (which carries toolName + input) for the card preview.
    for (let pi = 0; pi < message.parts.length; pi++) {
      const p = message.parts[pi] as {
        type: string;
        text?: string;
        toolCallId?: string;
        toolName?: string;
        state?: string;
        args?: unknown;
        input?: unknown;
        output?: unknown;
        approvalId?: string;
      };
      if (p.type === "reasoning") {
        // hideReasoning suppresses the whole segment stream (audit 2026-10-08:
        // the prop only gated the legacy `reasoning` string, so approval-resume
        // turns rendered the seeded AND the live thought panels side by side).
        if (hideReasoning) continue;
        const content = (p.text ?? "").trim();
        if (!content) continue;
        if (!cur || cur.kind !== "reasoning") {
          cur = {
            kind: "reasoning",
            content,
            durationMs: (p as { durationMs?: number }).durationMs,
          };
          out.push(cur);
        } else {
          cur.content += "\n" + content;
        }
      } else if (p.type === "text") {
        const content = stripToolDsl(p.text ?? "");
        if (!content) continue;
        if (!cur || cur.kind !== "text") {
          cur = { kind: "text", content };
          out.push(cur);
        } else {
          cur.content += content;
        }
      } else if (
        p.type === "tool" ||
        p.type === "dynamic-tool" || // MCP/dynamic tools — replayed as-is (audit 2026-10-09: they rendered NOTHING on reload — silent content loss)
        (p.type.startsWith("tool-") &&
          p.type !== "tool-approval-request" &&
          p.type !== "tool-approval-response")
      ) {
        // v7 tool parts arrive LIVE as `tool-<name>` (e.g. `tool-webFetch`) —
        // the normalize-to-`tool` step only runs on hydrate/persist, so without
        // this prefix match the live card (incl. the approval AskCard, whose
        // state `approval-requested` is set on THIS part by the SDK, not on a
        // separate part) never mounted and the gate looked like a frozen turn.
        // toolName/input/output/state live on the part directly; merge a
        // consecutive same-name completed tool into the preceding pending one
        // so a call→result round is ONE card.
        //
        // Φ-docs·BUGFIX: an unanswered tool-approval surfaces from the SDK as a
        // TOOL part with `state: "approval-requested"` and the approval id on
        // `part.approval.id` (NOT a raw `tool-approval-request` part and NOT a
        // top-level `approvalId`). Previously neither was read here, so the
        // AskCard never mounted and the gate hung silently. Map it to the same
        // `state:"ask"` segment the raw-type branch produces (which carries
        // approvalId for the Allow/Deny → addToolApprovalResponse call).
        const toolName = p.toolName ?? (p.type?.startsWith("tool-") ? p.type.slice(5) : undefined) ?? "tool";
        // createDocument renders ONCE via DocumentCard (docParts path) —
        // skipping it here kills the ToolCard+DocumentCard double-render
        // (audit 2026-10-09, deep-sweep #3).
        if (toolName === "createDocument") continue;
        const isApproval = p.state === "approval-requested";
        const approvalId = isApproval
          ? (p as unknown as { approval?: { id?: string } }).approval?.id
          : undefined;
        // Map raw v7 tool-part states onto the card's vocabulary — live parts
        // carry e.g. "input-available" which is NOT a resting state. UNKNOWN
        // states fall to "unknown" → the stale-pending gate renders a neutral
        // interrupted chip (never a green success card) — audit 2026-10-09 #12.
        // "interrupted" is DISTINCT (operator 2026-10-10): it only ever comes
        // from an approval-gated tool whose decision never happened (burial /
        // orphan sweep / stale purge) — the tool NEVER RAN. Rendering the
        // alarm "INTERRUPTED — the turn stopped before it finished" pill for it
        // was noise the operator explicitly rejected ("we don't have to show
        // the user all that"); it now renders as nothing.
        const mapToolState = (s?: string): string =>
          s === "input-streaming"
            ? "streaming"
            : s === "input-available" || s === "approval-responded"
              ? "pending"
              : s === "approval-requested"
                ? "ask"
              : s === "output-available"
                ? "complete"
                : s === "output-error"
                  ? "error"
                  : s === "output-denied"
                    ? "denied"
                    : s === "interrupted"
                      ? "skipped"
                      : (s === "pending" || s === "streaming" || s === "ask" || s === "complete"
                          ? s
                          : "unknown");
        const last = out[out.length - 1] as Seg | undefined;
        if (
          last &&
          last.kind === "tool" &&
          last.toolName === toolName &&
          (last.state === "pending" || last.state === "streaming")
        ) {
          last.state =
            p.state === "approval-responded" && p.output !== undefined
              ? "complete"
              : mapToolState(p.state);
          last.output = p.output ?? last.output;
          if (last.toolName === "spawn_agents") {
            const snap = (last.toolCallId ? orchByCall.get(last.toolCallId) : undefined) ??
              (p.toolCallId ? orchByCall.get(p.toolCallId) : undefined);
            last.orch = toAgentRunState(snap, last.input, last.state, last.output);
          }
          continue;
        }
        cur = {
          kind: "tool",
          toolName,
          // approval-responded carrying a real output means the tool RAN (the
          // resume executed it) — the row just settled before the seed patch
          // flipped the state. Render complete, not the stale-pending error.
          state: isApproval
            ? "ask"
            : p.state === "approval-responded" && p.output !== undefined
              ? "complete"
              : mapToolState(p.state),
          input: p.input ?? p.args ?? undefined,
          output: p.output ?? undefined,
          toolCallId: p.toolCallId,
          approvalId,
        };
        // Φ-multi-agent: attach the reduced orchestration snapshot (undefined
        // until the first data-orchestration part lands; the card falls back
        // to the tool input's task list so it renders instantly on approval).
        if (toolName === "spawn_agents") {
          const snap = p.toolCallId ? orchByCall.get(p.toolCallId) : undefined;
          cur.orch = toAgentRunState(snap, cur.input, cur.state, cur.output);
        }
        out.push(cur);
      } else if (p.type === "tool-approval-request") {
        // The request part carries only approvalId + toolCallId — the tool
        // name / args come in the FOLLOWING tool-call part (emitted once the
        // user approves). Look ahead for it so the AskCard can preview
        // "Allow webFetch: <url>" before the user decides.
        const req = p as { approvalId?: string; toolCallId?: string };
        const toolCallId = req.toolCallId;
        const approvalId = req.approvalId;
        let toolName = "tool";
        let preview: unknown;
        for (let j = pi + 1; j < message.parts.length; j++) {
          const later = message.parts[j] as {
            type?: string;
            toolCallId?: string;
            toolName?: string;
            input?: unknown;
          };
          if (later.type === "tool-call" && later.toolCallId === toolCallId) {
            toolName = later.toolName ?? "tool";
            preview = later.input;
            break;
          }
        }
        cur = {
          kind: "tool",
          toolName,
          state: "ask",
          input: preview,
          approvalId,
          toolCallId,
        };
        out.push(cur);
      } else if (p.type === "tool-call" || p.type === "tool-result") {
        const toolName = p.toolName ?? (p.type?.startsWith("tool-") ? p.type.slice(5) : undefined) ?? "tool";
        const last = out[out.length - 1] as Seg | undefined;
        // An APPROVED tool-call arrives after its approval-request. Morph the
        // AskCard (same toolCallId) into the running card so it's ONE card,
        // not "Allow?" then a duplicate "calling…" card.
        if (
          p.type === "tool-call" &&
          last &&
          last.kind === "tool" &&
          last.state === "ask" &&
          last.toolCallId === p.toolCallId
        ) {
          last.state = p.state ?? "pending";
          last.toolName = toolName;
          last.input = p.input ?? last.input;
          last.approvalId = undefined;
          last.toolCallId = undefined;
          continue;
        }
        // Merge a tool-result into the preceding tool-call so the two halves
        // of a tool round render as ONE card (call → state → result).
        if (
          p.type === "tool-result" &&
          last &&
          last.kind === "tool" &&
          last.toolName === toolName &&
          (last.state === "pending" || last.state === "streaming")
        ) {
          last.state = p.state ?? "complete";
          last.output = p.output ?? last.output;
          continue;
        }
        // UIMessage tool-call / tool-result parts carry the schema-mapped args
        // on `input` (never `args` — that's the old provider stream shape).
        cur = {
          kind: "tool",
          toolName,
          state: p.state ?? "pending",
          input: p.input ?? undefined,
          output: p.output ?? undefined,
        };
        out.push(cur);
      }
    }
    // One Subagents card per turn: a retried/repaired spawn leaves multiple
    // tool segs — keep only the LAST. Also drop text segs that are just the
    // raw {tasks:[…]} input echoing next to the card.
    const spawnIdxs = out
      .map((s, i) => (s.kind === "tool" && s.toolName === "spawn_agents" ? i : -1))
      .filter((i) => i >= 0);
    if (spawnIdxs.length > 1) {
      // splice descending — earlier indexes stay valid
      for (let i = spawnIdxs.length - 2; i >= 0; i--) out.splice(spawnIdxs[i], 1);
    }
    if (spawnIdxs.length > 0) {
      for (let i = out.length - 1; i >= 0; i--) {
        const s = out[i];
        if (s.kind === "text" && isRawTasksJson(s.content)) out.splice(i, 1);
      }
    }
    return out;
  }, [message.parts, isUser, hideReasoning]);

  // Multi-segment image hydration (deep-sweep #17): renderText covers the
  // single-text-run case; multi-segment messages hydrate EACH text segment
  // against the same IndexedDB cache (keyed by message id).
  const [hydratedSegs, setHydratedSegs] = useState<Record<number, string>>({});
  const textSegCountNow = segments.filter((s) => s.kind === "text").length;
  useEffect(() => {
    if (!needsHydrate || textSegCountNow <= 1) return;
    let active = true;
    (async () => {
      const out: Record<number, string> = {};
      await Promise.all(
        segments.map(async (seg, i) => {
          if (seg.kind !== "text" || !seg.content.includes("#img-")) return;
          out[i] = await hydrateMessageImages(message.id, seg.content);
        }),
      );
      if (active) setHydratedSegs(out);
    })();
    return () => {
      active = false;
    };
  }, [segments, message.id, needsHydrate, textSegCountNow]);

  // Per-segment live timing (2026-09-05): the message-level reasoningMs made
  // EVERY "Thought" block show the same duration while streaming. Each
  // reasoning segment gets its own start stamp; it freezes the moment a later
  // segment exists (thinking → tool → thinking = two independent clocks) or
  // the stream ends. Server-stamped seg.durationMs still wins once persisted.
  const segTimingRef = useRef(new Map<string, { start: number; end?: number }>());
  const segElapsed = useMemo(() => {
    const map = segTimingRef.current;
    const out = new Map<number, number>();
    segments.forEach((seg, i) => {
      if (seg.kind !== "reasoning") return;
      const key = `${i}:${seg.content.slice(0, 48)}`;
      let rec = map.get(key);
      if (!rec) {
        rec = { start: performance.now() };
        map.set(key, rec);
      }
      const isLast = i === segments.length - 1;
      if ((!isLast || !isStreaming) && rec.end === undefined) {
        rec.end = performance.now();
      }
      if (rec.end !== undefined) out.set(i, rec.end - rec.start);
    });
    return out;
  }, [segments, isStreaming]);

  const textSegCount = segments.filter((s) => s.kind === "text").length;

  // Tool-run grouping (2026-10-09): runs of 2+ consecutive SETTLED tool
  // segments (never approvals / spawn_agents / createDocument / the live tail)
  // collapse into one ToolRunGroup. toolGroupMemberOf: index → leader index.
  const [groupOpen, setGroupOpen] = useState<Record<number, boolean>>({});
  const { toolGroups, toolGroupMemberOf } = useMemo(() => {
    const groups = new Map<number, Array<{ seg: (typeof segments)[number]; i: number }>>();
    const memberOf = new Map<number, number>();
    let run: Array<{ seg: (typeof segments)[number]; i: number }> = [];
    const flush = () => {
      if (run.length >= 2) {
        const leader = run[0].i;
        groups.set(leader, run);
        for (const m of run) memberOf.set(m.i, leader);
      }
      run = [];
    };
    segments.forEach((seg, i) => {
      const groupable =
        seg.kind === "tool" &&
        seg.toolName !== "spawn_agents" &&
        seg.toolName !== "createDocument" &&
        // askUser renders its own question→answer chip — never group it.
        seg.toolName !== "askUser" &&
        seg.state !== "ask" &&
        // Denied/error tools keep their own surface — grouping them under a
        // green "done" run contradicts the standalone declined/error chip.
        seg.state !== "denied" &&
        seg.state !== "error" &&
        // Never-ran approval-gated tools render as nothing — never group them
        // into a "2 complete" run (operator 2026-10-10).
        seg.state !== "skipped" &&
        // Only fully settled tools group — a pending/streaming/error-with-live
        // card keeps its own surface (retry affordances etc).
        seg.state !== "pending" &&
        seg.state !== "streaming" &&
        seg.state !== "unknown" &&
        !(isStreaming && i === segments.length - 1);
      if (groupable) run.push({ seg, i });
      else flush();
    });
    flush();
    return { toolGroups: groups, toolGroupMemberOf: memberOf };
  }, [segments, isStreaming]);

  // Kit Sources row: domains+titles from any webSearch/webFetch tool segment.
  const toolSources = useMemo(() => {
    const out: SourceItem[] = [];
    const seen = new Set<string>();
    for (const s of segments) {
      const tools = s.kind === "tool" ? [s] : [];
      for (const t of tools) {
        const o = t.output as
          | { results?: Array<{ url?: string; title?: string }>; url?: string }
          | undefined;
        // webFetch output has no url — take it from the input.
        const inUrl = (t.input as { url?: string } | undefined)?.url;
        const items =
          o?.results ??
          (o?.url
            ? [{ url: o.url }]
            : inUrl
              ? [{ url: inUrl, title: undefined }]
              : []);
        for (const r of items) {
          if (!r.url) continue;
          let domain = "";
          try {
            domain = new URL(r.url).hostname.replace(/^www\./, "");
          } catch {
            continue;
          }
          if (seen.has(domain)) continue;
          seen.add(domain);
          out.push({ domain, title: r.title ?? domain, url: r.url });
        }
      }
    }
    return out;
  }, [segments]);

  const handleCopy = () => {
    // clipboard.writeText rejects when the document lacks focus/permission —
    // never let that surface as an unhandled error; the copy still "worked"
    // from the user's view in secure contexts, and elsewhere we just skip.
    navigator.clipboard.writeText(renderText).catch(() => {});
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // More-menu actions: per-message export + copy.
  // Copy here copies the RENDERED markdown source (renderText) — the copy
  // button copies the same; plain-text strips the markdown fences/decorations
  // so a paste into a doc is clean.
  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(renderText).catch(() => {});
    toast.success("Copied as Markdown");
  };
  const handleCopyPlain = () => {
    const plain = renderText
      .replace(/```[\w-]*\n?/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1");
    navigator.clipboard.writeText(plain).catch(() => {});
    toast.success("Copied as plain text");
  };
  const handleExportMd = () => {
    const blob = new Blob([renderText], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leopard-response.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Exported as .md");
  };

  // ── Φ7 action buttons ───────────────────────────────────────────────────
  const handleCopyUser = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedUser(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedUser(false), 1600);
  };

  // Edit (user): inline EditMessage textarea replaces the bubble. Save =
  // delete server rows at-or-after this message (else the live-mirror heal
  // resurrects them), truncate local state, then fire `composer:set-text` so
  // the composer repopulates with the edited text for resend.
  const startEdit = () => {
    setEditDraft(text);
    setEditing(true);
  };
  const saveEdit = () => {
    const trimmed = editDraft.trim();
    setEditing(false);
    if (!trimmed || trimmed === text) return;
    // Defer one tick: if the edit-UI model picker just changed the model, the
    // currentModelIdRef syncs in an effect AFTER this commit — sending in the
    // same tick would resend on the STALE model (same race as pickRegenModel).
    setTimeout(() => {
      try {
        chat.editAndResend?.(message.id, trimmed);
      } catch {
        toast.error("Couldn't resend the edited message");
      }
    }, 50);
  };

  // Registry text models for the RegenerateMenu "Retry with…" list.
  const regenOptions = useMemo<RegenerateOption[]>(
    () =>
      getActiveModels()
        .filter((m) => m.kind === "text" && !m.unavailable)
        .map((m) => ({ id: m.id, label: m.name, detail: m.speedTier })),
    [],
  );
  const pickRegenModel = (id: string) => {
    setRegenOpen(false);
    if (id === chat.currentModelId) {
      handleRegenerate();
      return;
    }
    chat.setCurrentModel(id);
    // currentModelIdRef syncs in an effect after this commit — defer the regen
    // one tick so the new request actually carries the picked model.
    setTimeout(() => handleRegenerate(), 50);
  };

  const handleRegenerate = () => {
    try {
      // Φ-regen-ghost: the SDK drops this assistant row from state the moment
      // regeneration starts, so the reply visually VANISHES until the new one
      // completes. Hand the transcript a snapshot (dimmed, in-place) to show
      // while the new stream runs — cleared when the reply settles.
      window.dispatchEvent(
        new CustomEvent("leopard:regen-ghost", {
          detail: { id: message.id, message },
        }),
      );
      // Provider wrapper deletes the old server-persisted row FIRST (else the
      // live-mirror resurrects it next to the new reply), then regenerates.
      chat.regenerateMessage(message.id);
    } catch {
      toast.error("Couldn't regenerate");
    }
  };

  // ──────────────────────────────────────────────────────────────────────

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        // a11y (audit 2026-10-10): the action bar reveals on .group:hover /
        // focus-within — a keyboard user tabbing INTO the message's Copy/Edit
        // used to land on invisible controls. Making the row focusable
        // (tabIndex 0) gives focus-within a real trigger point; the visible
        // ring stays subtle (data-attribute so it matches the action reveal).
        tabIndex={0}
        // a11y (audit 2026-10-10): a message is an article — ATs navigate by
        // landmark/heading, and a bare div reads as anonymous text.
        role="article"
        aria-label="You"
        className="group flex justify-end py-3 outline-none focus-visible:ring-1 focus-visible:ring-[#ffb400]/25 rounded-lg"
      >
        <div className="max-w-[68ch] ml-auto flex flex-col items-end">
          {/* Flat message pair: the user's turn is plain right-aligned text;
              in edit mode the forked EditMessage card replaces the bubble. */}
          {editing ? (
            <EditMessage
              className="w-full"
              value={editDraft}
              originalValue={getMessageText(message)}
              discardedReplies={Math.max(
                0,
                chat.messages.length -
                  chat.messages.findIndex((m) => m.id === message.id) -
                  1,
              )}
              onValueChange={setEditDraft}
              onSave={saveEdit}
              onCancel={() => setEditing(false)}
              models={regenOptions.map((o) => ({ id: o.id, label: o.label }))}
              currentModelId={chat.currentModelId}
              onModelChange={(id) => chat.setCurrentModel(id)}
            />
          ) : (
            <>
              {/* Attachments above the bubble: images as real thumbnails
                  (data-URL persists verbatim, works live + after reload),
                  other files as name cards. */}
              {userFileParts.length > 0 && (
                <div className="mb-2 flex max-w-[70%] flex-col items-end gap-1.5">
                  {userFileParts.map((f, i) =>
                    f.mediaType?.startsWith("image/") ? (
                      <button
                        key={i}
                        type="button"
                        aria-label={`View ${f.filename ?? "image"} full size`}
                        onClick={() =>
                          setLightbox({ src: f.url, alt: f.filename ?? "attachment" })
                        }
                        className="block cursor-zoom-in rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#ffb400]/60"
                      >
                        <img
                          src={f.url}
                          alt={f.filename ?? "attachment"}
                          className="max-h-64 max-w-full rounded-2xl object-cover dark:border dark:border-white/[0.08]"
                        />
                      </button>
                    ) : (
                      // Non-image attachment: click downloads (the data-URL is
                      // inline, so it's just an anchor download). Was inert.
                      <a
                        key={i}
                        href={f.url}
                        download={f.filename ?? "attachment"}
                        aria-label={`Download ${f.filename ?? "file"}`}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] dark:bg-white/[0.07] dark:text-[#d4d4d4] light:bg-black/[0.05] light:text-[#404040] transition-colors hover:dark:bg-white/[0.1] hover:light:bg-black/[0.07] outline-none focus-visible:ring-1 focus-visible:ring-[#ffb400]/40"
                      >
                        <Paperclip className="h-3.5 w-3.5 shrink-0 opacity-50" />
                        <span className="max-w-56 truncate">{f.filename ?? "file"}</span>
                      </a>
                    ),
                  )}
                </div>
              )}
              {text.trim() && (() => {
                // Quote fidelity: the Quote
                // reply pill prepends `> quoted` markdown; render leading
                // `> ` lines as a real blockquote above the user's own words
                // instead of dumping the raw `>` into the bubble.
                const lines = text.split("\n");
                let i = 0;
                const quoteLines: string[] = [];
                while (i < lines.length && lines[i].trimStart().startsWith("> ")) {
                  quoteLines.push(lines[i].trimStart().slice(2));
                  i += 1;
                }
                // Skip a single blank separator line after the quote block.
                if (i < lines.length && lines[i].trim() === "" && quoteLines.length > 0) i += 1;
                const quote = quoteLines.join("\n").trim();
                const rest = lines.slice(i).join("\n");
                return (
                  <div className="flex max-w-[70%] flex-col items-end gap-1.5">
                    {quote && (
                      <blockquote className="max-w-full rounded-[14px] border-l-2 dark:border-[#ffb400]/40 light:border-[#d49600]/50 dark:bg-[#ffb400]/[0.06] light:bg-black/[0.04] px-3 py-1.5 text-[13.5px] leading-[1.55] dark:text-[#a3a3a3] light:text-[#525252]">
                        {quote}
                      </blockquote>
                    )}
                    {rest.trim() && (
                      <div className="rounded-[20px] dark:bg-white/[0.07] light:bg-black/[0.05] px-4 py-2.5">
                        <p className="text-[15px] leading-[1.65] whitespace-pre-wrap break-words dark:text-[#e8e8e8] light:text-[#262626]"><UserText text={rest} /></p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
          <div className="flex items-center justify-end gap-1 mt-2 action-reveal">
            <button
              type="button"
              onClick={handleCopyUser}
              aria-label="Copy message"
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono dark:text-[#6b6b6b] light:text-[#525252] hover:dark:text-[#e5e5e5] hover:light:text-[#1f1607] hover:dark:bg-white/[0.04] hover:light:bg-black/[0.03] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#ffb400]/40"
            >
              {copiedUser ? (
                <>
                  <Check className="h-3 w-3 text-green-400" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Copy
                </>
              )}
           </button>
            <button
              type="button"
              onClick={startEdit}
              aria-label="Edit and resend"
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono dark:text-[#6b6b6b] light:text-[#525252] hover:dark:text-[#ffb400] hover:light:text-[#d49600] hover:dark:bg-[#ffb400]/[0.06] hover:light:bg-[#ffb400]/[0.08] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#ffb400]/40"
            >
              <PencilLine className="h-3 w-3" /> Edit
           </button>
         </div>
       </div>
     </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      // See the user-branch note — keyboard users need the row focusable so
      // the action bar's focus-within reveal has a trigger point.
      tabIndex={0}
      // a11y (audit 2026-10-10): a message is an article — ATs navigate by
      // landmark; a bare div reads as anonymous text.
      role="article"
      aria-label="Assistant"
      className="group py-4 outline-none focus-visible:ring-1 focus-visible:ring-[#ffb400]/25 rounded-lg"
    >
      <div ref={quoteRootRef}>
          {/* No header timer row — elapsed time belongs on the thinking
              panel's collapsible header only (user directive 2026-08-26). */}

{/* Φ6.1: streaming-empty fallback. Some NIM reasoning models (e.g.
           * glm-5.3 at "max") emit ONLY `delta.content` — no `reasoning_content`
           * — so before the first text-delta there's neither a reasoning card
           * nor any text nor a doc card. Without this gate the assistant row
           * renders just the bare "leopard" label for seconds → "prompt alive
           * but nothing shows". Show the working dots exactly in that window;
           * the moment the first text/reasoning/doc lands, the gate closes. */}
                    {isStreaming && !reasoning && !renderText && docParts.length === 0 && (
            <ThinkingIndicator className="max-w-none my-2" label="Working" />
          )}

          {/* Branch browsing swaps the reply body for the picked variant. */}
          {branchText !== null && (
            <StreamingText content={branchText} streaming={false} />
          )}

          {/* Refusal heuristic: a settled assistant answer opening with a
              decline pattern gets a subtle guardrail note above the text. */}
          {branchText === null && !isStreaming && isRefusal(text) && (
            <GuardrailNotice
              className="mb-2 max-w-none"
              title="The assistant declined this request"
              explanation="The response below is a refusal. Rephrase the request or narrow its scope and try again."
              policy="guardrail"
              alternatives={[]}
            />
          )}

          {/* While a branch is browsed the live segments (reasoning, tools,
              text) hide — the variant IS the whole reply for that turn. */}
          {branchText === null && segments.map((seg, i) => {
            const isLast = i === segments.length - 1;
            // Tool-run grouping (2026-10-09): 2+ consecutive settled tool
            // segments (not approvals/spawn_agents/createDocument, never the
            // live tail) collapse into one expandable ToolRunGroup card
            // instead of a wall of individual cards. Members return null; the
            // group leader renders the card.
            const memberOf = toolGroupMemberOf.get(i);
            if (memberOf !== undefined && memberOf !== i) return null;
            if (memberOf === i) {
              const items = toolGroups.get(i)!;
              const tools = items.map(({ seg: s, i: idx }) => ({
                id: (s.kind === "tool" && s.toolCallId) || `g${i}-${idx}`,
                name: s.kind === "tool" ? s.toolName : "tool",
                target: s.kind === "tool" ? toolTarget(s.toolName, s.input) : "",
                state: (s.kind === "tool" && s.state === "error"
                  ? "failed"
                  : "done") as "done" | "failed",
              }));
              const names = [...new Set(tools.map((t) => t.name))].join(", ");
              return (
                <ToolRunGroup
                  key={`tg-${i}`}
                  label={names}
                  tools={tools}
                  className="max-w-none"
                  open={groupOpen[i] ?? false}
                  onOpenChange={(o) => setGroupOpen((m) => ({ ...m, [i]: o }))}
                />
              );
            }
            if (seg.kind === "reasoning") {
              // Skip empty persisted reasoning (a stalled turn can persist an
              // empty thought part) — a bare "Thought process" row is noise.
              if (!seg.content.trim() && !isStreaming) return null;
              const live = isStreaming && isLast;
              return (
                <ReasoningPanel
                  key={`r-${i}`}
                  className="max-w-none"
                  content={compactWhitespace(seg.content)}
                  streaming={live}
                  open={reasoningOpen[i] ?? live}
                  onOpenChange={(o) =>
                    setReasoningOpen((m) => ({ ...m, [i]: o }))
                  }
                  elapsedMs={seg.durationMs ?? segElapsed.get(i) ?? reasoningMs}
                  effortBadge={
                    // Badge only the LIVE turn (audit 2026-10-08): historical
                    // rows rendered today's currentReasoning — a later model
                    // switch silently relabeled old thoughts. The message's own
                    // level isn't persisted, so "no badge" beats "wrong badge".
                    live && currentReasoning && currentReasoning !== "off"
                      ? EFFORT_LABEL[currentReasoning]
                      : undefined
                  }
                />
              );
            }
            if (seg.kind === "tool") {
              // A pending approval renders ONLY as the composer-zone
              // ApprovalDock (user directive 2026-08-26: one permission card,
              // at the bottom, replacing the input). The transcript shows
              // nothing until the decision morphs this segment into the
              // running/result card.
              if (seg.state === "ask") return null;
              // Approval-gated tool whose decision never happened (turn ended
              // first) — operator 2026-10-10: the INTERRUPTED alarm pill for a
              // tool that NEVER RAN is noise. Render nothing; the answer text
              // (or its absence) tells the story.
              if (seg.state === "skipped") return null;
              // askUser (structured clarifying question): the settled part
              // renders as a compact question → answer chip, not a generic tool
              // card. The question is the input, the user's pick the output.
              if (seg.toolName === "askUser") {
                const q = (seg.input as { question?: string } | undefined)?.question;
                const answer = (seg.output as { answer?: string } | undefined)?.answer;
                return (
                  <div
                    key={`ask-${i}`}
                    className="my-2 flex max-w-md flex-col gap-1 rounded-xl border dark:border-white/[0.08] light:border-black/[0.08] dark:bg-white/[0.03] light:bg-black/[0.025] px-3.5 py-2.5"
                  >
                    {q && (
                      <span className="text-[12.5px] dark:text-[#a3a3a3] light:text-[#525252]">
                        {q}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-[13px] font-medium dark:text-[#e8e8e8] light:text-[#262626]">
                      <span className="dark:text-[#ffb400] light:text-[#d49600]">→</span>
                      {answer ?? "…"}
                    </span>
                  </div>
                );
              }
              // Φ-multi-agent: spawn_agents → inline orchestration card
              // (live data-orchestration snapshots + settled tool output).
              if (seg.toolName === "spawn_agents" && seg.orch && !hideSpawnCard) {
                // Settle a stale card: the turn ended (not streaming) but the
                // tool never reached output-available (stop/error/crash
                // mid-orchestration). Without this the card pulses "running ·
                // x/y" forever on a dead turn (2026-09-02 audit).
                const orch =
                  !isStreaming && seg.state !== "complete"
                    ? {
                        agents: seg.orch.agents.map((a) =>
                          a.status === "done" || a.status === "error"
                            ? a
                            : { ...a, status: "error" as const, note: "interrupted" },
                        ),
                        done: true,
                      }
                    : seg.orch;
                return <AgentRunCard key={`orch-${i}`} run={orch} />;
              }
              // Denied ≠ failed. A user-declined tool must not render as a red
              // error card (reads like the tool ran and broke). Neutral chip.
              if (seg.state === "denied") {
                return (
                  <div
                    key={`denied-${i}`}
                    className="my-2 inline-flex items-center gap-2 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-1.5 text-[12px] text-foreground/50"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-wide">declined</span>
                    <span className="font-medium">{seg.toolName}</span>
                    — you blocked this action
                  </div>
                );
              }
              if (seg.state === "error") {
                const errMsg =
                  typeof seg.output === "object" && seg.output !== null
                    ? ((seg.output as { error?: string }).error ?? "Tool call failed")
                    : "Tool call failed";
                // Dismissed tool errors hide (Skip); Retry re-runs the turn
                // (audit 2026-10-09: both buttons used to render disabled
                // dead-ends — no handlers were ever passed).
                if (dismissedToolErr.has(i)) return null;
                return (
                  <ToolError
                    key={`te-${i}`}
                    name={seg.toolName}
                    target={toolTarget(seg.toolName, seg.input)}
                    message={errMsg}
                    attempt={1}
                    maxAttempts={1}
                    retrying={false}
                    onRetry={() => chat.regenerateMessage(message.id)}
                    onSkip={() =>
                      setDismissedToolErr((s) => new Set(s).add(i))
                    }
                  />
                );
              }
              const live =
                isStreaming &&
                isLast &&
                seg.state !== "complete" &&
                seg.state !== "ask";
              // Stale-pending settle: a tool part left in pending/streaming
              // when the turn is NOT live (stop/error/crash/reload mid-call).
              // With no output it's an INTERRUPTION, not a failure — render a
              // neutral chip, not a red "Tool call failed" + inert Retry (audit
              // 2026-10-06). A real error carries output.error and shows ToolError.
              const stalePending =
                !live &&
                (seg.state === "pending" ||
                  seg.state === "streaming" ||
                  seg.state === "unknown");
              if (stalePending && seg.output == null) {
                return (
                  <div
                    key={`int-${i}`}
                    className="my-2 inline-flex items-center gap-2 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-1.5 text-[12px] text-foreground/50"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-wide">interrupted</span>
                    <span className="font-medium">{seg.toolName}</span>
                    — the turn stopped before it finished
                  </div>
                );
              }
              const settledState = stalePending ? "error" : seg.state;
              return (
                <ToolCard
                  key={`t-${i}`}
                  toolName={seg.toolName}
                  state={live ? "streaming" : settledState}
                  input={seg.input}
                  output={seg.output}
                />
              );
            }
            // Image placeholders hydrate against the full text concatenation;
            // single-run messages use renderText directly; multi-segment
            // messages hydrate each text segment against the same cache
            // (audit 2026-10-09, deep-sweep #17 — image placeholders in
            // multi-segment messages never hydrated).
            const segText =
              textSegCount === 1 && renderText
                ? renderText
                : (hydratedSegs[i] ?? seg.content);
            return (
              <StreamingText
                key={`t-${i}`}
                content={segText}
                // Only the TAIL segment streams (caret + amber tail + throttle).
                // Passing isStreaming to every segment rendered one blinking
                // caret per text run — the "two indicators" bug.
                streaming={isStreaming && isLast}
              />
            );
          })}

          {/* Φ-live: the single amber caret lives INSIDE StreamItDown
              (leopard-stream-caret) — no second cursor here. */}

          {docParts.length > 0 && (
            <div className="mt-1">
              {docParts.map((p, i) => (
                <DocumentCard key={`doc-${i}`} part={p} live={isStreaming} />
              ))}
            </div>
          )}

          {/* Generative UI: renderWidget parts render as interactive widgets. */}
          {widgetParts.length > 0 && (
            <div className="mt-1">
              {widgetParts.map((p, i) => {
                const args = (p as { input?: unknown }).input;
                // The SDK may serialize the input as a JSON string — parse it.
                // Mid-stream the args arrive as a PARTIAL JSON string: repair
                // it (fixJson closes dangling strings/containers) so widgets
                // render progressively as their props land instead of popping
                // in at settle. Unrepairable → wait for more chunks.
                let spec: unknown = args;
                if (typeof args === "string") {
                  try {
                    spec = JSON.parse(args);
                  } catch {
                    try {
                      spec = JSON.parse(fixJson(args)[0]);
                    } catch {
                      return null;
                    }
                  }
                }
                if (!spec || typeof spec !== "object") return null;
                return <WidgetRenderer key={`widget-${i}`} spec={spec as never} />;
              })}
            </div>
          )}

          {toolSources.length > 0 && !isStreaming && (
            <Sources sources={toolSources} className="mt-2" />
          )}

          {/* Tool-card-only turns (createDocument flows end on the card, no
              closing text) still get the action row — copy/export/regenerate
              apply to the turn regardless of a text tail (audit 2026-10-12). */}
          {!isStreaming && (renderText || segments.some((s) => s.kind === "tool")) && (
            <div className="mt-3 action-reveal">
              {/* Leopard MessageActions (forked kit element) — icon-swap copy,
                  amber active reaction, forked RegenerateMenu with model
                  picker, read-aloud button. Thumbs-down opens FeedbackDialog. */}
              <div className="flex items-center gap-1">
                <MessageActions
                  copied={copied}
                  reaction={feedbackVote}
                  regenerating={chat.status === "submitted" || chat.status === "streaming"}
                  onCopy={handleCopy}
                  onReactionChange={(r) => {
                    if (r === feedbackVote) return;
                    if (r === null) {
                      try {
                        window.localStorage.removeItem(`lf:fb:${message.id}`);
                      } catch {}
                      setFeedbackVote(null);
                      setFeedbackOpen(false);
                    } else if (r === "up") {
                      setFeedback(message.id, "up");
                      setFeedbackVote("up");
                      setFeedbackOpen(false);
                      toast.success("Marked as helpful");
                    } else {
                      // Thumbs-down → forked reason dialog; the vote persists
                      // on its submit, not on the initial click.
                      setRegenOpen(false);
                      setFeedbackSent(false);
                      setFeedbackOpen(true);
                    }
                  }}
                  onRegenerate={handleRegenerate}
                  regenerateMenu={
                    <RegenerateMenu
                      options={regenOptions}
                      open={regenOpen}
                      currentId={chat.currentModelId}
                      onOpenChange={(o) => {
                        setRegenOpen(o);
                        if (o) setFeedbackOpen(false);
                      }}
                      onRetry={handleRegenerate}
                      onPick={pickRegenModel}
                    />
                  }
                  moreMenu={
                    <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
                      <DropdownMenuTrigger
                        render={
                          <button
                            type="button"
                            aria-label="More response actions"
                            className={cn(
                              ghostButton,
                              "size-7",
                            )}
                          />
                        }
                      >
                        <EllipsisIcon className="size-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-48">
                        <DropdownMenuItem onClick={handleExportMd}>
                          Export as .md
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleCopyMarkdown}>
                          Copy as Markdown
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleCopyPlain}>
                          Copy as plain text
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
                <ReadAloudButton text={renderText} />
                {/* Operator 2026-09-02: no whole-run timing — timing lives only
                    on the thinking panel and per-agent rows. */}
              </div>
              {/* Regen history: prior replies to the same prompt, browsable.
                  Latest (visible above) is the last variant. */}
              {siblings.length > 0 && (
                <MessageBranches
                  className="mt-2"
                  variants={[...siblings, renderText]}
                  index={branchIdx ?? siblings.length}
                  onIndexChange={setBranchIdx}
                />
              )}
              {feedbackOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                  onClick={() => setFeedbackOpen(false)}
                >
                  <div onClick={(e) => e.stopPropagation()}>
                    <FeedbackDialog
                  reasons={["Inaccurate", "Unhelpful", "Too long", "Wrong tone"]}
                  selected={feedbackReasons}
                  note={feedbackNote}
                  sent={feedbackSent}
                  onToggleReason={(r) =>
                    setFeedbackReasons((cur) =>
                      cur.includes(r)
                        ? cur.filter((x) => x !== r)
                        : [...cur, r],
                    )
                  }
                  onNoteChange={setFeedbackNote}
                  onCancel={() => setFeedbackOpen(false)}
                  onSubmit={() => {
                    setFeedback(message.id, "down");
                    setFeedbackVote("down");
                    setFeedbackSent(true);
                    toast.success("Marked — we'll improve the next reply");
                    setTimeout(() => setFeedbackOpen(false), 1400);
                  }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          </div>

      {/* Quote-reply: selecting text in this message floats a "Quote" pill;
          clicking fills the composer with a > blockquote of the selection. */}
      <QuoteReply
        containerRef={quoteRootRef}
        onQuote={(q) =>
          window.dispatchEvent(
            new CustomEvent("composer:set-text", {
              detail: { text: `> ${q.replace(/\n+/g, "\n> ")}\n\n` },
            }),
          )
        }
      />
      {/* Image lightbox: the attached-image click
          opens the full-size preview. Assistant markdown images self-render
          theirs (streaming-text MarkdownImage). */}
      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
    </motion.div>
  );
});

export function ThinkingMessage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto"
    >
      <div className="flex items-start gap-3 py-5">
        <ThinkingIndicator className="max-w-none" label="Working" />
     </div>
   </motion.div>
  );
}



