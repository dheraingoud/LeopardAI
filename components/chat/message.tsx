"use client";

import { memo, useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  ChevronDown,
  ChevronRight,
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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { hydrateMessageImages } from "@/lib/image-cache";
import type { ArtifactKind, ChatMessage } from "@/lib/types";
import { useActiveChat } from "@/hooks/use-active-chat";
import { StreamItDown } from "@/components/chat/streamitdown";
import type { ReasoningLevel } from "@/lib/nim";

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
};

/**
 * Inline "Document created" card — the artifact opener rendered in the
 * transcript for each `tool-createDocument` part. After the stream finishes
 * (state "output-available") it shows the title + kind; clicking reopens the
 * side panel — setArtifact seeds metadata and the panel rehydrates content
 * from Convex via api.documents.getLatest (see artifact-panel.tsx). While
 * the tool is still streaming (no output yet) it shows a muted "creating…"
 * state so the user sees the doc is being assembled before the panel opens.
 */
function DocumentCard({ part }: { part: DocToolPart }) {
  const { setArtifact } = useActiveChat();

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
  const handleOpen = () => {
    // Seed metadata; content rehydrates from Convex (getLatest) in the panel
    // effect — avoids a second client fetch path + keeps this card stateless.
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
    <button
      type="button"
      onClick={handleOpen}
      className="group/card mt-3 w-full sm:max-w-sm flex items-center gap-3 rounded-lg border dark:border-white/[0.08] light:border-black/[0.08] dark:bg-white/[0.02] light:bg-black/[0.015] hover:dark:bg-white/[0.05] hover:light:bg-black/[0.03] px-3 py-2.5 text-left transition-colors"
    >
      <span className="flex items-center justify-center h-7 w-7 rounded-md dark:bg-[#ffb400]/10 light:bg-[#ffb400]/15 shrink-0">
        <Icon className="h-3.5 w-3.5 text-[#ffb400]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-body dark:text-[#e5e5e5] light:text-[#262626] truncate">
          {title || "Untitled"}
        </span>
        <span className="block text-[10px] font-mono dark:text-[#606060] light:text-[#8a8a8a] uppercase tracking-tighter">
          {kind} · created
        </span>
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 dark:text-[#505050] light:text-[#8a8a8a] group-hover/card:text-[#ffb400] transition-colors shrink-0" />
    </button>
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
 * Vercel-style reasoning card: auto-opens while the reasoning streams, then
 * auto-collapses when the answer text begins (consumes the `!text` gate the
 * caller already computes), leaving a "Thought for Ns" header + an effort
 * badge. Click re-expands; the local `expanded` state is only force-driven
 * on an `isStreamingReasoning` transition, so a manual toggle persists after.
 * The block stays NON-glass (it's content, not a popover) — amber is limited
 * to the Brain accent and the left border. Reasoning text renders as markdown
 * via StreamItDown (plain while streaming, highlighted once the answer lands).
 */
function ReasoningBlock({
  content,
  effort,
  isStreamingReasoning,
  elapsedMs,
  isStreaming,
}: {
  content: string;
  effort?: ReasoningLevel;
  isStreamingReasoning?: boolean;
  elapsedMs?: number;
  /**
   * Φ7.7 interleaved thinking — the parent stream is currently active overall
   * (not just the reasoning phase). When the stream interleaves reasoning →
   * text → reasoning again the card stays expanded so the user can follow
   * the second thought batch live. Auto-collapse happens only when the WHOLE
   * stream ends (`isStreaming` is false).
   */
  isStreaming?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // Φ7.7: forced open while streaming, forced closed once the stream ends.
  // User can still toggle mid-stream; auto-collapse kicks in on stream end.
  useEffect(() => {
    if (isStreaming || isStreamingReasoning) {
      setExpanded(true);
    } else {
      setExpanded(false);
    }
  }, [isStreaming, isStreamingReasoning]);

  const headerText = isStreamingReasoning
    ? "Thinking…"
    : elapsedMs !== undefined
      ? `Thought for ${Math.max(1, Math.round(elapsedMs / 1000))}s`
      : "Thought process";
  const showBadge =
    !isStreamingReasoning && effort !== undefined && effort !== "off";

  return (
    <div className="cb-reasoning mb-3">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1.5 text-[12px] dark:text-[#606060] light:text-[#737373] hover:dark:text-[#909090] hover:light:text-[#525252] transition-colors py-1"
      >
        <Brain className="h-3.5 w-3.5 text-[#ffb400]/50" />
        <span className="font-mono">{headerText}</span>
        {showBadge && (
          <span className="ml-1 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-tighter dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-[#a3a3a3] light:border-black/[0.08] light:bg-black/[0.02] light:text-[#525252]">
            {EFFORT_LABEL[effort as ReasoningLevel]}
          </span>
        )}
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {isStreamingReasoning && (
          <div className="flex gap-[2px] ml-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1 h-1 rounded-full bg-[#ffb400]"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pl-3 ml-1 border-l-2 border-[#ffb400]/15 text-[12px] dark:text-[#505050] light:text-[#737373] leading-relaxed mt-1 max-h-[250px] overflow-y-auto">
              <StreamItDown content={content} streaming={isStreamingReasoning} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
  const [copiedUser, setCopiedUser] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedbackVote, setFeedbackVote] = useState<"up" | "down" | null>(() =>
    feedbackStore(message?.id ?? ""),
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
        <div className="max-w-[80%]">
          <div className="cb-message-user rounded-2xl border px-5 py-3 dark:border-[#ffb40024] dark:bg-[linear-gradient(145deg,#1f1607_0%,#171006_50%,#110c05_100%)] dark:text-[#f6e8cc] dark:shadow-[0_10px_30px_rgba(0,0,0,0.32)] light:border-[#d4960040] light:bg-[linear-gradient(145deg,#fff7e6_0%,#fdeec9_50%,#f8e2ad_100%)] light:text-[#3a2a08] light:shadow-[0_10px_30px_rgba(212,150,0,0.18)]">
            <p className="text-[15px] leading-[1.6] whitespace-pre-wrap">{text}</p>
         </div>
          <div className="flex items-center justify-end gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
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
      className="group py-5 cb-message-assistant"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[12px] font-mono dark:text-[#505050] light:text-[#737373]">
              leopard
            </span>
          </div>

          {/* Φ6.1: streaming-empty fallback. Some NIM reasoning models (e.g.
           * glm-5.2 at "max") emit ONLY `delta.content` — no `reasoning_content`
           * — so before the first text-delta there's neither a reasoning card
           * nor any text nor a doc card. Without this gate the assistant row
           * renders just the bare "leopard" label for seconds → "prompt alive
           * but nothing shows". Show the working dots exactly in that window;
           * the moment the first text/reasoning/doc lands, the gate closes. */}
          {isStreaming && !reasoning && !renderText && docParts.length === 0 && (
            <div className="flex items-center gap-2 pt-0.5">
              <div className="flex gap-[3px]">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-[7px] h-[7px] rounded-full bg-[#ffb400]"
                    animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
              <span className="text-[13px] dark:text-[#505050] light:text-[#737373]">
                Working on it…
              </span>
            </div>
          )}

          {reasoning && (
            <ReasoningBlock
              content={reasoning}
              effort={currentReasoning}
              isStreamingReasoning={isStreaming && !text}
              elapsedMs={reasoningMs}
              isStreaming={isStreaming}
            />
          )}

          {renderText && (
            <StreamItDown content={renderText} streaming={isStreaming} />
          )}

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
            <div className="flex items-center gap-0.5 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
          <span className="text-[12px] font-mono dark:text-[#505050] light:text-[#737373]">
            leopard
          </span>
          <div className="flex items-center gap-3">
            <div className="flex gap-[3px]">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-[7px] h-[7px] rounded-full bg-[#ffb400]"
                  animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
            <span className="text-[14px] dark:text-[#505050] light:text-[#737373]">
              Working on it…
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
