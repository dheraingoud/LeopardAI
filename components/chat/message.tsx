"use client";

import { memo, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  ChevronDown,
  Copy,
  Check,
  FileText,
  Code,
  Table,
  Image as ImageIcon,
  ArrowUpRight,
  PencilLine,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Download,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn, compactWhitespace } from "@/lib/utils";
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
import { MessageTiming } from "./leopard/message-timing";
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
const reasoningElapsedCache = new Map<string, number>();

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
    output as { agents?: Array<{ name: string; kind: string; status: string; note?: string }> } | undefined
  )?.agents;
  if (outAgents?.length) {
    return {
      agents: outAgents.map((a) => ({
        name: a.name,
        kind: (a.kind as AgentRunState["agents"][number]["kind"]) ?? "general",
        task: "",
        status: (a.status as AgentRunState["agents"][number]["status"]) ?? "done",
        note: a.note,
      })),
      done,
    };
  }
  if (snap) return { agents: snap.agents, done };
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
function DocumentCard({ part }: { part: DocToolPart }) {
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

  // Streaming / not-yet-complete → kit ArtifactCard in its generating state.
  if (part.state !== "output-available" || !part.output) {
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          onClick={() => setPreviewOpen(false)}
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
                onClick={() => setPreviewOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg dark:text-[#505050] light:text-[#737373] hover:dark:text-[#e5e5e5] hover:light:text-[#262626] hover:dark:bg-white/[0.06] hover:light:bg-black/[0.04] transition-colors"
                title="Close preview"
              >
                <ArrowUpRight className="h-4 w-4 rotate-45" />
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
const isRefusal = (text: string) => REFUSAL_RE.test(text);

export const PreviewMessage = memo(function PreviewMessage({
  message,
  isLast,
  status,
  hideSpawnCard = false,
}: {
  message: ChatMessage;
  isLast: boolean;
  status: string;
  // Φ-multi-agent: one AgentRunCard per TURN. The approval→resume flow can
  // leave the spawn_agents tool part on two messages (the pre-approval
  // assistant row + the resumed row) — messages.tsx passes hideSpawnCard to
  // every spawn-bearing message except the LAST, so the card renders once.
  hideSpawnCard?: boolean;
}) {
  const isUser = message.role === "user";
  const text = getMessageText(message);
  const reasoning = !isUser ? getMessageReasoning(message) : "";
  const isStreaming = !isUser && isLast && status === "streaming";
  // Φ6: tool-createDocument parts → inline artifact-opener cards (see
  // DocumentCard). Empty for user msgs; assistant msgs get one per tool call.
  const docParts = !isUser
    ? (message.parts.filter(
        (p) => p.type === "tool-createDocument",
      ) as unknown as DocToolPart[])
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
  const timingMs = isUser ? undefined : chat.getTiming(message.id);
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
  const [reasoningMs, setReasoningMs] = useState<number | undefined>(
    () => (reasoning ? reasoningElapsedCache.get(reasoning.slice(0, 64)) : undefined),
  );
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
      reasoningElapsedCache.set(reasoning.slice(0, 64), ms);
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
      | { kind: "reasoning"; content: string }
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
      | { kind: "reasoning"; content: string }
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
        const content = (p.text ?? "").trim();
        if (!content) continue;
        if (!cur || cur.kind !== "reasoning") {
          cur = { kind: "reasoning", content };
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
        const isApproval = p.state === "approval-requested";
        const approvalId = isApproval
          ? (p as unknown as { approval?: { id?: string } }).approval?.id
          : undefined;
        // Map raw v7 tool-part states onto the card's vocabulary — live parts
        // carry e.g. "input-available" which is NOT a resting state.
        const mapToolState = (s?: string): string =>
          s === "input-streaming"
            ? "streaming"
            : s === "input-available" || s === "approval-responded"
              ? "pending"
              : s === "output-available"
                ? "complete"
                : s === "output-error"
                  ? "error"
                  : s === "output-denied"
                    ? "denied"
                    : (s ?? "complete");
        const last = out[out.length - 1] as Seg | undefined;
        if (
          last &&
          last.kind === "tool" &&
          last.toolName === toolName &&
          (last.state === "pending" || last.state === "streaming")
        ) {
          last.state = mapToolState(p.state);
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
          state: isApproval ? "ask" : mapToolState(p.state),
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
  }, [message.parts, isUser]);

  const textSegCount = segments.filter((s) => s.kind === "text").length;

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
    // Edit → auto-resend (no "press Enter" detour — operator 2026-09-01).
    try {
      chat.editAndResend?.(message.id, trimmed);
    } catch {
      toast.error("Couldn't resend the edited message");
    }
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
        className="group flex justify-end py-3"
      >
        <div className="max-w-[68ch] ml-auto flex flex-col items-end">
          {/* Flat message pair: the user's turn is plain right-aligned text;
              in edit mode the forked EditMessage card replaces the bubble. */}
          {editing ? (
            <EditMessage
              className="w-full"
              value={editDraft}
              discardedReplies={Math.max(
                0,
                chat.messages.length -
                  chat.messages.findIndex((m) => m.id === message.id) -
                  1,
              )}
              onValueChange={setEditDraft}
              onSave={saveEdit}
              onCancel={() => setEditing(false)}
            />
          ) : (
            // Clone-style user bubble (filled, rounded) in leopard tokens.
            <div className="max-w-[70%] rounded-[20px] dark:bg-white/[0.07] light:bg-black/[0.05] px-4 py-2.5">
              <p className="text-[15px] leading-[1.65] whitespace-pre-wrap break-words dark:text-[#e8e8e8] light:text-[#262626]"><UserText text={text} /></p>
            </div>
          )}
          <div className="flex items-center justify-end gap-1 mt-2 action-reveal">
            <button
              type="button"
              onClick={handleCopyUser}
              aria-label="Copy message"
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono dark:text-[#353535] light:text-[#262626] hover:dark:text-[#e5e5e5] hover:light:text-[#1f1607] hover:dark:bg-white/[0.04] hover:light:bg-black/[0.03] transition-colors"
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
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono dark:text-[#353535] light:text-[#262626] hover:dark:text-[#ffb400] hover:light:text-[#d49600] hover:dark:bg-[#ffb400]/[0.06] hover:light:bg-[#ffb400]/[0.08] transition-colors"
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
      className="group py-4"
    >
      <div ref={quoteRootRef}>
          {/* No header timer row — elapsed time belongs on the thinking
              panel's collapsible header only (user directive 2026-08-26). */}

{/* Φ6.1: streaming-empty fallback. Some NIM reasoning models (e.g.
           * glm-5.2 at "max") emit ONLY `delta.content` — no `reasoning_content`
           * — so before the first text-delta there's neither a reasoning card
           * nor any text nor a doc card. Without this gate the assistant row
           * renders just the bare "leopard" label for seconds → "prompt alive
           * but nothing shows". Show the working dots exactly in that window;
           * the moment the first text/reasoning/doc lands, the gate closes. */}
                    {isStreaming && !reasoning && !renderText && docParts.length === 0 && (
            <ThinkingIndicator className="max-w-none my-2" label="Working on it…" />
          )}

          {/* Refusal heuristic: a settled assistant answer opening with a
              decline pattern gets a subtle guardrail note above the text. */}
          {!isStreaming && isRefusal(text) && (
            <GuardrailNotice
              className="mb-2 max-w-none"
              title="The assistant declined this request"
              explanation="The response below is a refusal. Rephrase the request or narrow its scope and try again."
              policy="guardrail"
              alternatives={[]}
            />
          )}

          {segments.map((seg, i) => {
            const isLast = i === segments.length - 1;
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
                  elapsedMs={reasoningMs}
                  effortBadge={
                    !live &&
                    currentReasoning &&
                    currentReasoning !== "off"
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
              if (seg.state === "error") {
                const errMsg =
                  typeof seg.output === "object" && seg.output !== null
                    ? ((seg.output as { error?: string }).error ?? "Tool call failed")
                    : "Tool call failed";
                return (
                  <ToolError
                    key={`te-${i}`}
                    name={seg.toolName}
                    target={toolTarget(seg.toolName, seg.input)}
                    message={errMsg}
                    attempt={1}
                    maxAttempts={1}
                    retrying={false}
                  />
                );
              }
              const live =
                isStreaming &&
                isLast &&
                seg.state !== "complete" &&
                seg.state !== "ask";
              // Stale-pending settle: a tool part left in pending/streaming
              // when the turn is NOT live (stop/error/crash/reload mid-call)
              // must not shimmer "searching…" forever — render it failed.
              const settledState =
                !live && (seg.state === "pending" || seg.state === "streaming")
                  ? "error"
                  : seg.state;
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
            // only apply that swap when there's a single text run.
            const segText =
              textSegCount === 1 && renderText ? renderText : seg.content;
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
                <DocumentCard key={`doc-${i}`} part={p} />
              ))}
            </div>
          )}

          {toolSources.length > 0 && !isStreaming && (
            <Sources sources={toolSources} className="mt-2" />
          )}

          {!isStreaming && renderText && (
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
                />
                <ReadAloudButton text={renderText} />
                {/* Total stream time for this reply (recorded by use-active-chat). */}
                {timingMs !== undefined && (
                  <MessageTiming
                    className="ml-2"
                    stats={[
                      {
                        label: "total",
                        value:
                          timingMs >= 1000
                            ? `${(timingMs / 1000).toFixed(1)}s`
                            : `${timingMs}ms`,
                      },
                    ]}
                  />
                )}
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
        <ThinkingIndicator className="max-w-none" label="Working on it…" />
     </div>
   </motion.div>
  );
}



