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
import { StreamItDown } from "@/components/chat/streamitdown";
import type { ReasoningLevel } from "@/lib/nim";
import { PulseLoader } from "./pulse-loader";
import { ReasoningPanel } from "./leopard/reasoning-panel";

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

  // Streaming / not-yet-complete → muted "creating…" state.
  if (part.state !== "output-available" || !part.output) {
    const kind = part.input?.kind ?? "text";
    const Icon = KIND_ICON[kind] ?? FileText;
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-lg border dark:border-white/[0.08] light:border-black/[0.08] dark:bg-white/[0.02] light:bg-black/[0.015] px-3 py-2 text-[12px] font-mono dark:text-[#707070] light:text-[#8a8a8a]">
        <Icon className="h-3.5 w-3.5 text-[#ffb400]/60" />
        creating {part.input?.title ?? "document"}…
      </div>
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
        <button
          type="button"
          onClick={handleOpen}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:dark:bg-white/[0.04] hover:light:bg-black/[0.02] transition-colors"
        >
          <span className="flex items-center justify-center h-7 w-7 rounded-md dark:bg-[#ffb400]/10 light:bg-[#ffb400]/15 shrink-0">
            <Icon className="h-3.5 w-3.5 text-[#ffb400]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-body dark:text-[#e5e5e5] light:text-[#262626] truncate">
              {title || "Untitled"}
            </span>
            <span className="block text-[10px] font-mono dark:text-[#606060] light:text-[#8a8a8a] uppercase tracking-tighter">
              {extLabel} · {content ? `${(content.length / 1024).toFixed(1)} KB` : "created"}
            </span>
          </span>
          <ArrowUpRight className="h-3.5 w-3.5 dark:text-[#505050] light:text-[#8a8a8a] group-hover/card:text-[#ffb400] transition-colors shrink-0" />
        </button>

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
  approvalId,
  onDecision,
}: {
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
  approvalId?: string;
  onDecision?: (approved: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const isSearch = toolName === "webSearch";
  const pending = state === "streaming" || state === "pending" || state === "loading";
  const verb = isSearch ? "searching web" : toolName;

  // Elapsed clock — starts when the card mounts pending, freezes on complete.
  // Mirrors the reasoning tracker: live → ticking, done → "Fetched in Ns".
  const startRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (pending) {
      if (startRef.current === null) startRef.current = performance.now();
      const id = setInterval(() => {
        if (startRef.current !== null)
          setElapsedMs(performance.now() - startRef.current);
      }, 100);
      return () => clearInterval(id);
    }
    if (startRef.current !== null) {
      setElapsedMs(performance.now() - startRef.current);
      startRef.current = null;
    }
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const seconds = elapsedMs !== undefined ? Math.max(0.1, elapsedMs / 1000).toFixed(1) : null;

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
  let resultOk = true;
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

  // ── Sprint 2: permission-gating AskCard ───────────────────────────────────
  // A tool call awaiting user approval (state "ask"). Themed decision card —
  // allow (amber) / deny (neutral). `onDecision` fires addToolApprovalResponse;
  // the server then runs (or skips) the tool and the builder morphs this card
  // into the running/result card — never two cards for one round.
  if (state === "ask") {
    return (
      <div className={cn("cb-tool cb-ask my-3 overflow-hidden rounded-2xl", "border dark:border-[#ffb400]/20 light:border-[#d49600]/25", "dark:bg-white/[0.03] light:bg-black/[0.015] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]")}>
        <div className="flex flex-col gap-2.5 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center">
              <MeshGlobe className="h-[18px] w-[18px] text-[#ffb400] animate-[cb-meshspin_6s_linear_infinite]" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#ffb400]">
              {toolName === "webSearch" ? "search access" : "web access request"}
            </span>
          </div>
          <div className="pl-[28px] text-[12px] leading-[1.7] dark:text-[#a3a3a3] light:text-[#464646]">
            Leopard wants to run{" "}
            <code className="rounded bg-[#ffb400]/10 px-1 py-px font-mono text-[11px] text-[#ffb400]">
              {toolName}
            </code>
            {summary && (
              <>
                {" on "}
                <span className="font-mono text-[11px] break-all dark:text-[#cfcfcf] light:text-[#1d1d1f]">
                  {summary}
                </span>
              </>
            )}
            . Allow?
          </div>
          <div className="flex items-center gap-2 pl-[28px] pt-0.5">
            <button
              type="button"
              onClick={() => onDecision?.(true)}
              className="rounded-full bg-[#ffb400] px-4 py-1.5 text-[11px] font-semibold text-black transition-transform duration-150 active:scale-[0.97] hover:brightness-110"
            >
              Allow
            </button>
            <button
              type="button"
              onClick={() => onDecision?.(false)}
              className="rounded-full px-4 py-1.5 text-[11px] font-semibold dark:text-[#a3a3a3] light:text-[#525252] dark:bg-white/[0.06] light:bg-black/[0.05] transition-colors hover:dark:bg-white/[0.1] hover:light:bg-black/[0.08]"
            >
              Deny
            </button>
            {(!approvalId || !onDecision) && (
              <span className="text-[10px] font-mono text-[#606060]">waiting for server…</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("cb-tool my-3 overflow-hidden rounded-2xl", "border dark:border-white/[0.06] light:border-black/[0.08]", "dark:bg-white/[0.02] light:bg-black/[0.015] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "group flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors duration-200",
          "hover:dark:bg-white/[0.02] hover:light:bg-black/[0.02]",
        )}
      >
        {/* Mesh globe — wireframe sphere, shimmers on the leading edge while live. */}
        <span className="relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center overflow-visible">
          <MeshGlobe
            className={cn(
              "h-[18px] w-[18px] transition-colors duration-300",
              pending ? "text-[#ffb400]" : resultOk ? "text-[#5f8bff]" : "text-red-400",
            )}
            animate={pending}
          />
          {pending && (
            <span className="absolute inset-0 animate-pulse">
              <span className="absolute inset-0 rounded-full bg-[#ffb400]/25 blur-[3px]" />
            </span>
          )}
        </span>

        <span
          className={cn(
            "min-w-0 text-[11px] font-semibold uppercase tracking-[0.14em]",
            pending ? "text-[#ffb400]" : resultOk ? "text-[#909090]" : "text-red-400",
          )}
        >
          {pending ? `${verb}…` : resultOk ? "fetched" : "failed"}
        </span>

        <span className="flex min-w-0 flex-1 items-center gap-1">
          {pending ? (
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-[#606060] tabular-nums">
              <span className="glimmer-track" aria-hidden="true">
                <span className="glimmer-sweep" />
              </span>
              <span className="truncate text-[#ffb400]/90">{summary}</span>
            </span>
          ) : seconds !== null ? (
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-[#606060] tabular-nums">
              <span className="text-[#404040]">·</span>
              <span>{seconds}s</span>
              {summary && <span className="truncate text-[#909090]">{summary}</span>}
            </span>
          ) : null}
        </span>

        <span className="flex-1" />

        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-[#606060] transition-transform duration-300 ease-out",
            !open && "-rotate-90",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 border-t px-4 py-3 dark:border-white/[0.05] light:border-black/[0.06] text-[12px] leading-[1.7] dark:text-[#9a9a9a] light:text-[#404040]">
              <p className="flex items-start gap-1.5">
                <span className="mt-px shrink-0 text-[10px] font-mono uppercase tracking-tighter dark:text-[#505050] light:text-[#9a9a9a]">{urlLabel}</span>
                <span className="break-all">{summary}</span>
              </p>
              {resultLine && (
                <p className="flex items-start gap-1.5">
                  <span className="mt-px shrink-0 text-[10px] font-mono uppercase tracking-tighter dark:text-[#505050] light:text-[#9a9a9a]">result</span>
                  <span className="break-words">{resultLine}</span>
                </p>
              )}
              {summary && !isSearch && (
                <button
                  type="button"
                  onClick={copyUrl}
                  className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono dark:text-[#353535] light:text-[#262626] hover:dark:text-[#e5e5e5] hover:light:text-[#1f1607] hover:dark:bg-white/[0.06] hover:light:bg-black/[0.04] transition-colors"
                >
                  {copiedUrl ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                  {copiedUrl ? "Copied" : "Copy URL"}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// MeshGlobe — a minimal wireframe sphere (meridian + latitude ellipses), so
// the tool card carries the "browser sphere" mark the thinking card implies.
// While `animate` it slowly rotates + pulses its leading arc (shimmer).
function MeshGlobe({ className, animate }: { className?: string; animate?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={animate ? { animation: "cb-meshspin 3.2s linear infinite" } : undefined}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
    >
      {/* longitudes near view edge + center meridian */}
      <ellipse cx="50" cy="50" rx="30" ry="49" />
      <ellipse cx="50" cy="50" rx="49" ry="49" />
      {/* latitudes */}
      <ellipse cx="50" cy="50" rx="49" ry="14" />
      <ellipse cx="50" cy="50" rx="49" ry="30" />
      {/* equator */}
      <line x1="1" y1="50" x2="99" y2="50" />
    </svg>
  );
}

export const PreviewMessage = memo(function PreviewMessage({
  message,
  isLast,
  status,
}: {
  message: ChatMessage;
  isLast: boolean;
  status: string;
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
  const [feedbackVote, setFeedbackVote] = useState<"up" | "down" | null>(() =>
    feedbackStore(message?.id ?? ""),
  );
  // Reasoning panel open overrides — keyed by segment index. Default is
  // derived (`live`): completed cards default collapsed, live ones open; an
  // explicit click wins. (Keeps the stale-card fix: no mount-time open state.)
  const [reasoningOpen, setReasoningOpen] = useState<Record<number, boolean>>(
    {},
  );
  useEffect(() => {
    // Re-read vote if message.id changes (e.g. after streaming completes and
    // the optimistic id gets swapped for the persisted one).
    setFeedbackVote(feedbackStore(message?.id ?? ""));
  }, [message?.id]);
  // Reasoning elapsed tracker: start the clock when reasoning first appears,
  // freeze once the answer text begins (or the stream ends) → "Thought for Ns".
  const reasoningStartRef = useRef<number | null>(null);
  const [reasoningMs, setReasoningMs] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (isUser || !reasoning) {
      reasoningStartRef.current = null;
      return;
    }
    if (reasoningStartRef.current === null && isStreaming && !text) {
      reasoningStartRef.current = performance.now();
      setReasoningMs(undefined);
      return;
    }
    if (reasoningStartRef.current !== null && (text || !isStreaming)) {
      setReasoningMs(Math.round(performance.now() - reasoningStartRef.current));
      reasoningStartRef.current = null;
    }
    // reasoningMs intentionally excluded (would loop on every tick).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reasoning, text, isStreaming]);
  // Φ8: hydrate persisted image placeholders (post-reload) from IndexedDB.
  // Render `text` immediately (no blank), then swap once hydrate resolves.
  // For non-image content (the common case) hydrate is a no-op (returns the
  // string unchanged) → renderText never diverges → no extra render.
  const [renderText, setRenderText] = useState(text);
  useEffect(() => {
    let active = true;
    void hydrateMessageImages(message.id, text).then((h) => {
      if (active && h !== renderText) setRenderText(h);
    });
    return () => {
      active = false;
    };
    // renderText is intentionally excluded: tracking it would re-trigger the
    // effect on every hydrate swap and loop. Deps are "message text changed".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id, text]);

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
        }
    > = [];
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
        const content = p.text ?? "";
        if (!content) continue;
        if (!cur || cur.kind !== "text") {
          cur = { kind: "text", content };
          out.push(cur);
        } else {
          cur.content += content;
        }
      } else if (p.type === "tool") {
        // v7 native tool part (and legacy `tool-*` parts normalized to `tool`
        // by lib/ai/message-parts on hydrate). toolName/input/output/state live
        // on the part directly; merge a consecutive same-name completed tool
        // into the preceding pending one so a call→result round is ONE card.
        //
        // Φ-docs·BUGFIX: an unanswered tool-approval surfaces from the SDK as a
        // TOOL part with `state: "approval-requested"` and the approval id on
        // `part.approval.id` (NOT a raw `tool-approval-request` part and NOT a
        // top-level `approvalId`). Previously neither was read here, so the
        // AskCard never mounted and the gate hung silently. Map it to the same
        // `state:"ask"` segment the raw-type branch produces (which carries
        // approvalId for the Allow/Deny → addToolApprovalResponse call).
        const toolName = p.toolName ?? "tool";
        const isApproval = p.state === "approval-requested";
        const approvalId = isApproval
          ? (p as unknown as { approval?: { id?: string } }).approval?.id
          : undefined;
        const last = out[out.length - 1] as Seg | undefined;
        if (
          last &&
          last.kind === "tool" &&
          last.toolName === toolName &&
          (last.state === "pending" || last.state === "streaming")
        ) {
          last.state = p.state ?? "complete";
          last.output = p.output ?? last.output;
          continue;
        }
        cur = {
          kind: "tool",
          toolName,
          state: isApproval ? "ask" : (p.state ?? "complete"),
          input: p.input ?? p.args ?? undefined,
          output: p.output ?? undefined,
          toolCallId: p.toolCallId,
          approvalId,
        };
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
        const toolName = p.toolName ?? "tool";
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
    return out;
  }, [message.parts, isUser]);

  const textSegCount = segments.filter((s) => s.kind === "text").length;

  const handleCopy = () => {
    navigator.clipboard.writeText(renderText);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Φ7 action buttons ───────────────────────────────────────────────────
  const handleCopyUser = () => {
    navigator.clipboard.writeText(text);
    setCopiedUser(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedUser(false), 1600);
  };

  // Edit (user): truncate messages[] from this one onward so the assistant
  // response downstream is replaced on next send, then fire `composer:set-text`
  // — the composer listens (multimodal-input effect) and repopulates + focuses.
  const handleEditUser = () => {
    try {
      const messages = chat.messages;
      const idx = messages.findIndex((m) => m.id === message.id);
      if (idx >= 0)
        (chat.setMessages as unknown as (m: typeof messages) => void)?.(
          messages.slice(0, idx),
        );
    } catch {
      /* non-fatal — composer still populates */
    }
    window.dispatchEvent(
      new CustomEvent("composer:set-text", { detail: { text } }),
    );
    toast.success("Editing — press Enter to resend");
  };

  const handleRegenerate = () => {
    try {
      const r = (chat as unknown as { regenerate?: (opts?: { messageId?: string }) => void })
        .regenerate;
      if (typeof r === "function") void r({ messageId: message.id });
    } catch {
      toast.error("Couldn't regenerate");
    }
  };

  const handleLike = () => {
    const current = feedbackStore(message.id);
    if (current === "up") {
      try {
        window.localStorage.removeItem(`lf:fb:${message.id}`);
      } catch {}
      setFeedbackVote(null);
    } else {
      setFeedback(message.id, "up");
      setFeedbackVote("up");
      toast.success("Marked as helpful");
    }
  };

  const handleDislike = () => {
    const current = feedbackStore(message.id);
    if (current === "down") {
      try {
        window.localStorage.removeItem(`lf:fb:${message.id}`);
      } catch {}
      setFeedbackVote(null);
    } else {
      setFeedback(message.id, "down");
      setFeedbackVote("down");
      toast.success("Marked — we'll improve the next reply");
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
          {/* Flat message pair (aui variant="flat" style): the user's turn is
           * plain right-aligned text — no bubble chrome. Reads as one flat
           * column with the assistant reply; hover reveals copy/edit. */}
          <p className="text-[15px] leading-[1.65] whitespace-pre-wrap text-right dark:text-[#e8e8e8] light:text-[#262626]">{text}</p>
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
              onClick={handleEditUser}
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
      <div>
          <div className="flex items-center gap-2 mb-1.5">
            
          </div>

          {/* Φ6.1: streaming-empty fallback. Some NIM reasoning models (e.g.
           * glm-5.2 at "max") emit ONLY `delta.content` — no `reasoning_content`
           * — so before the first text-delta there's neither a reasoning card
           * nor any text nor a doc card. Without this gate the assistant row
           * renders just the bare "leopard" label for seconds → "prompt alive
           * but nothing shows". Show the working dots exactly in that window;
           * the moment the first text/reasoning/doc lands, the gate closes. */}
                    {isStreaming && !reasoning && !renderText && docParts.length === 0 && (
            <PulseLoader size="sm" label="Working on it…" />
          )}

          {segments.map((seg, i) => {
            const isLast = i === segments.length - 1;
            if (seg.kind === "reasoning") {
              // A reasoning segment is "live" (open, shimmer) only while the
              // whole stream is active AND it's still the tail of the message.
              // Once later text supersedes it, it collapses to "Thought for Ns".
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
              const live = isStreaming && isLast && seg.state !== "complete";
              return (
                <ToolCard
                  key={`t-${i}`}
                  toolName={seg.toolName}
                  state={live ? "streaming" : seg.state}
                  input={seg.input}
                  output={seg.output}
                  approvalId={seg.approvalId}
                  onDecision={
                    seg.state === "ask" && seg.approvalId
                      ? (approved: boolean) =>
                          chat.addToolApprovalResponse?.({
                            id: seg.approvalId as string,
                            approved,
                          })
                      : undefined
                  }
                />
              );
            }
            // Image placeholders hydrate against the full text concatenation;
            // only apply that swap when there's a single text run.
            const segText =
              textSegCount === 1 && renderText ? renderText : seg.content;
            return (
              <StreamItDown
                key={`t-${i}`}
                content={segText}
                streaming={isStreaming}
              />
            );
          })}

          {isStreaming && text && (
            <motion.span
              className="inline-block w-[6px] h-[16px] bg-[#ffb400] rounded-[1px] ml-0.5 align-text-bottom"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}

          {docParts.length > 0 && (
            <div className="mt-1">
              {docParts.map((p, i) => (
                <DocumentCard key={`doc-${i}`} part={p} />
              ))}
            </div>
          )}

          {!isStreaming && renderText && (
            <div className="flex items-center gap-0.5 mt-3 action-reveal">
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Copy"
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono dark:text-[#353535] light:text-[#262626] hover:dark:text-[#e5e5e5] hover:light:text-[#1f1607] hover:dark:bg-white/[0.04] hover:light:bg-black/[0.03] transition-colors"
              >
                {copied ? (
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
                onClick={handleRegenerate}
                aria-label="Regenerate"
                disabled={chat.status === "submitted" || chat.status === "streaming"}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono dark:text-[#353535] light:text-[#262626] hover:dark:text-[#ffb400] hover:light:text-[#d49600] disabled:opacity-40 hover:dark:bg-[#ffb400]/[0.06] hover:light:bg-[#ffb400]/[0.08] transition-colors"
              >
                <RotateCcw className="h-3 w-3" /> Regen
            </button>
              <button
                type="button"
                onClick={handleLike}
                aria-label="Like"
                title="Mark as helpful"
                className={["flex items-center justify-center h-7 w-7 rounded-md transition-colors",feedbackVote === "up" ? "dark:bg-[#ffb400]/[0.12] light:bg-[#ffb400]/[0.16] dark:text-[#ffb400] light:text-[#d49600]" : "dark:text-[#505050] light:text-[#b8b8b8] hover:dark:text-[#ffb400] hover:light:text-[#d49600] hover:dark:bg-[#ffb400]/[0.06] hover:light:bg-[#ffb400]/[0.08]"].join(" ")}
              >
                <ThumbsUp className="h-3 w-3" />
            </button>
              <button
                type="button"
                onClick={handleDislike}
                aria-label="Dislike"
                title="Mark as unhelpful"
                className={["flex items-center justify-center h-7 w-7 rounded-md transition-colors",feedbackVote === "down" ? "dark:bg-[#ffb400]/[0.12] light:bg-[#ffb400]/[0.16] dark:text-[#ffb400] light:text-[#d49600]" : "dark:text-[#505050] light:text-[#b8b8b8] hover:dark:text-[#ffb400] hover:light:text-[#d49600] hover:dark:bg-[#ffb400]/[0.06] hover:light:bg-[#ffb400]/[0.08]"].join(" ")}
              >
                <ThumbsDown className="h-3 w-3" />
            </button>
          </div>
          )}

          </div>
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
        <div className="flex flex-col gap-2 pt-0.5">
          
          <PulseLoader size="sm" labelSize="md" label="Working on it…" className="gap-3" />
       </div>
     </div>
   </motion.div>
  );
}



