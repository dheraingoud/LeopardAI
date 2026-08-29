"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useActiveChat } from "@/hooks/use-active-chat";
import { PreviewMessage, ThinkingMessage } from "./message";
import { MouseGlow } from "@/components/ui/mouse-glow";
import { EMPTY_SUGGESTIONS, Suggestions } from "./leopard/suggestions";
import {
  EmptyState,
  EmptyStateGreeting,
  EmptyStateSuggestions,
} from "./leopard/empty-state";
import { ErrorState } from "./leopard/error-state";
import { FirstRunOnboarding } from "./leopard/onboarding";
import { ScrollAnchorPill } from "./leopard/scroll-anchor";
import { DaySeparator } from "./leopard/day-separator";
import { MessagePair } from "./leopard/message-pair";
import { StoppedRun } from "./leopard/stopped-run";
import type { ChatMessage } from "@/lib/types";

/**
 * Messages — the scrollable transcript. Phase 5 renders text + reasoning
 * parts only (image/file/tool parts land in Phase 6).
 *
 * Auto-scroll sticks to the bottom ONLY while the user is parked there. The
 * per-token stream updates would otherwise yank the viewport back down when
 * the user has scrolled up to read history, and `behavior: 'smooth'` would
 * pile up half-finished smooth-scroll animations on every token — so we use
 * an instant `scrollTop` jump gated by a stickToBottom flag.
 */
// ChatMessage carries no timestamp — record a first-seen client time per id.
// A reloaded chat therefore collapses to one day (no separators rendered).
function dayLabel(ts: number): string {
  const d = new Date(ts);
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = startOf(new Date()) - startOf(d);
  if (diff === 0) return "Today";
  if (diff === 86_400_000) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

const hasVisibleText = (m: ChatMessage) =>
  m.parts.some((p) => p.type === "text" && p.text.trim().length > 0);

// Day separators between day groups; each user→assistant turn is wrapped in
// one MessagePair (layout only — a turn reads as a single block).
function renderTranscript(
  messages: ChatMessage[],
  status: string,
  firstSeen: Map<string, number>,
): ReactNode[] {
  const rows: ReactNode[] = [];
  let pairNodes: ReactNode[] = [];
  let pairKey = "";
  let lastDay = "";
  const flush = () => {
    if (pairNodes.length === 0) return;
    rows.push(<MessagePair key={pairKey}>{pairNodes}</MessagePair>);
    pairNodes = [];
  };
  messages.forEach((message, index) => {
    const day = dayLabel(firstSeen.get(message.id) ?? 0);
    if (day !== lastDay) {
      flush();
      rows.push(
        <DaySeparator
          key={`day-${day}`}
          label={day}
          className="mt-2 mb-4 first:mt-0"
        />,
      );
      lastDay = day;
    }
    if (message.role === "user") flush();
    if (pairNodes.length === 0) pairKey = message.id;
    pairNodes.push(
      <PreviewMessage
        key={message.id}
        message={message}
        isLast={index === messages.length - 1}
        status={status}
      />,
    );
  });
  flush();
  return rows;
}

export function Messages() {
  const chat = useActiveChat();
  const { messages, status } = chat;
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const firstSeenRef = useRef(new Map<string, number>());
  for (const m of messages) {
    if (!firstSeenRef.current.has(m.id))
      firstSeenRef.current.set(m.id, Date.now());
  }

  // Stopped-run note: streaming→ready with an EMPTY trailing assistant bubble
  // means the run was cut before any token landed.
  const [stoppedId, setStoppedId] = useState<string | null>(null);
  const prevRunStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevRunStatusRef.current;
    prevRunStatusRef.current = status;
    if (status === "streaming" || status === "submitted") {
      setStoppedId(null);
      return;
    }
    if (prev === "streaming" && status === "ready") {
      const last = messages[messages.length - 1];
      setStoppedId(
        last?.role === "assistant" && !hasVisibleText(last) ? last.id : null,
      );
    }
  }, [status, messages]);

  // Φ-regen-ghost: while a regenerate runs, the SDK has dropped the old
  // assistant row from state — show the snapshot (dimmed) in its place so the
  // reply never visually vanishes. Clears the moment the stream settles or the
  // id reappears (mirror restored it).
  const [ghost, setGhost] = useState<ChatMessage | null>(null);
  useEffect(() => {
    const onGhost = (e: Event) => {
      const d = (e as CustomEvent).detail as { id: string; message: ChatMessage };
      if (d?.message) setGhost(d.message);
    };
    window.addEventListener("leopard:regen-ghost", onGhost);
    return () => window.removeEventListener("leopard:regen-ghost", onGhost);
  }, []);
  useEffect(() => {
    if (status === "ready" || status === "error") setGhost(null);
  }, [status, messages]);

  const showGhost =
    ghost !== null && !messages.some((m) => m.id === ghost.id);

  // Kit scroll-anchor: count messages that arrived while unpinned; the pill
  // jumps to bottom + repins.
  const [unseen, setUnseen] = useState(0);
  const prevCountRef = useRef(messages.length);
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = messages.length;
    if (!stickToBottomRef.current && messages.length > prev) {
      setUnseen((u) => u + (messages.length - prev));
    }
  }, [messages]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottomRef.current = atBottom;
    if (atBottom) setUnseen(0);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    // Instant jump (not smooth) — per-token updates would otherwise never
    // let a smooth-scroll animation finish.
    el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // aui parity (kit-fidelity audit 2026-08-28): scroll to bottom on RUN START
  // even when the user had scrolled up (useThreadViewportAutoScroll's
  // thread.runStart → scheduleScrollToBottom). Without this, sending a message
  // while reading history left the viewport stuck mid-transcript — your own
  // message + the incoming stream rendered off-screen.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    const runStarted =
      (prev === "ready" || prev === "error") &&
      (status === "submitted" || status === "streaming");
    if (!runStarted) return;
    stickToBottomRef.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [status]);

  if (messages.length === 0) {
    return <Greeting />;
  }

  const isThinking = status === "submitted";

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6"
      >
        <div className="max-w-3xl mx-auto py-6">
        {renderTranscript(messages, status, firstSeenRef.current)}
        {showGhost && (
          <div className="opacity-50 pointer-events-none select-none">
            <PreviewMessage message={ghost} isLast={false} status="ready" />
          </div>
        )}
        {stoppedId && (
          <StoppedRun
            reason="Stopped"
            onContinue={() => {
              chat.regenerateMessage(stoppedId);
              setStoppedId(null);
            }}
            onDiscard={() => setStoppedId(null)}
            className="mt-1"
          />
        )}
        {isThinking && <ThinkingMessage />}
        {status === "error" && (
          <ErrorState
            title="Response failed"
            detail="The stream errored or stalled — retry the last turn."
            retrying={false}
            onRetry={() => {
              const last =
                [...messages].reverse().find((m) => m.role === "assistant") ??
                messages[messages.length - 1];
              if (last) chat.regenerateMessage(last.id);
            }}
            className="mt-3"
          />
        )}
        <div className="h-32" /> {/* spacer for the floating input bar */}
        </div>
      </div>
      {unseen > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-10 flex justify-center">
          <ScrollAnchorPill
            count={unseen}
            onJump={() => {
              const el = scrollRef.current;
              if (el) el.scrollTop = el.scrollHeight;
              stickToBottomRef.current = true;
              setUnseen(0);
            }}
            className="pointer-events-auto"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Greeting — the empty-state centerpiece (DESIGN.md: no glass). Amber
 * signature text ("How can I help?") sits over a pure-CSS breathing amber
 * bloom (glass-breath keyframes, GPU-cheap, honors prefers-reduced-motion).
 * Auto-unmounts: `Messages` swaps `<Greeting/>` for the transcript the
 * instant `messages.length > 0`.
 */
function Greeting() {
  // Glass retired (DESIGN.md 2026-08-26): the refracting lens is gone; the
  // amber identity reads through a pure-CSS breathing bloom behind the text.
  const { sendMessage } = useActiveChat();
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 relative isolate">
      {/* Φ9 mouse-following ambient amber glow. */}
      <MouseGlow tone="amber" size={260} intensity={0.55} className="z-[1]" />
      {/* Ambient amber bloom behind the text — CSS only, no lens. */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="glass-breath w-[min(440px,82vw)] h-[200px] rounded-[2.5rem] bg-[radial-gradient(closest-side,rgba(255,180,0,0.12),transparent_72%)]" />
      </div>
      {/* Amber identity text — crisp, above the lens (never enters Glass). */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative text-center"
      >
        {/* First-run tour (localStorage leopard-onboarded); self-hides after
            skip/finish, leaving the EmptyState greeting as the fallback. */}
        <FirstRunOnboarding className="mx-auto mb-6 text-left" />
        <EmptyState>
          <EmptyStateGreeting className="font-signature text-5xl sm:text-6xl text-[#ffb400] text-glow-amber mb-3">
            How can I help?
          </EmptyStateGreeting>
          <p className="text-sm dark:text-[#505050] light:text-[#737373] font-mono">
            Ask anything — Leopard streams answers from your selected model.
          </p>
          <EmptyStateSuggestions className="mt-6">
            <Suggestions
              suggestions={EMPTY_SUGGESTIONS}
              label="Suggested first prompts"
              onSuggestion={(text) => {
                void sendMessage({ parts: [{ type: "text", text }] } as never);
              }}
            />
          </EmptyStateSuggestions>
        </EmptyState>
      </motion.div>
    </div>
  );
}
