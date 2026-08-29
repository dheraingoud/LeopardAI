"use client";

import { useEffect, useRef, useState } from "react";
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
export function Messages() {
  const { messages, status } = useActiveChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

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

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottomRef.current = atBottom;
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
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6"
    >
      <div className="max-w-3xl mx-auto py-6">
        {messages.map((message, index) => (
          <PreviewMessage
            key={message.id}
            message={message}
            isLast={index === messages.length - 1}
            status={status}
          />
        ))}
        {showGhost && (
          <div className="opacity-50 pointer-events-none select-none">
            <PreviewMessage message={ghost} isLast={false} status="ready" />
          </div>
        )}
        {isThinking && <ThinkingMessage />}
        <div className="h-32" /> {/* spacer for the floating input bar */}
      </div>
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
