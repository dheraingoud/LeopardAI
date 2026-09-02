"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useActiveChat } from "@/hooks/use-active-chat";
import { PreviewMessage, ThinkingMessage } from "./message";
import { EmptyState, EmptyStateGreeting } from "./leopard/empty-state";
import { ErrorState } from "./leopard/error-state";
import { Composer } from "./leopard/composer";
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

// A turn "has content" with visible text OR a completed tool call (artifact
// turns legitimately end on the tool card with no closing text — counting
// only text false-fired the Stopped note on every createDocument turn).
const hasVisibleText = (m: ChatMessage) =>
  m.parts.some(
    (p) =>
      (p.type === "text" && p.text.trim().length > 0) ||
      ((p.type === "dynamic-tool" || p.type.startsWith("tool-")) &&
        (p as { state?: string }).state === "output-available"),
  );

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
  // Φ-multi-agent: ONE AgentRunCard per turn. The approval→resume flow can
  // leave the spawn_agents tool part on TWO assistant messages (pre-approval
  // row + resumed row); per-message dedup can't see across messages, so find
  // the LAST spawn-bearing message here and hide the card on all earlier ones.
  let lastSpawnIdx = -1;
  messages.forEach((m, i) => {
    if (
      m.role === "assistant" &&
      m.parts.some(
        (p) =>
          p.type === "tool-spawn_agents" ||
          (p.type === "dynamic-tool" &&
            (p as { toolName?: string }).toolName === "spawn_agents"),
      )
    )
      lastSpawnIdx = i;
  });
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
        key={`${message.id}-${index}`}
        message={message}
        isLast={index === messages.length - 1}
        status={status}
        hideSpawnCard={
          lastSpawnIdx !== -1 &&
          index !== lastSpawnIdx &&
          message.parts.some(
            (p) =>
              p.type === "tool-spawn_agents" ||
              (p.type === "dynamic-tool" &&
                (p as { toolName?: string }).toolName === "spawn_agents"),
          )
        }
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

  // Reasoning-panel expand/collapse dispatches per-frame height deltas; hold
  // the reading anchor when NOT pinned to the bottom.
  useEffect(() => {
    const onResize = (e: Event) => {
      const d = (e as CustomEvent).detail as { delta?: number };
      const delta = d?.delta;
      const el = scrollRef.current;
      if (!delta || !el || stickToBottomRef.current) return;
      el.scrollTop += delta;
    };
    window.addEventListener("leopard:reasoning-resize", onResize);
    return () =>
      window.removeEventListener("leopard:reasoning-resize", onResize);
  }, []);

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

  // User-intent disengage: a programmatic scrollTop write + the async scroll
  // event can lose to a same-tick stream re-pin (probe 2026-09-02: scrollTop=0
  // snapped back mid-stream). Wheel/touch/keyboard are USER intent — unpin
  // synchronously on upward gestures, before any scroll event ordering race.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) stickToBottomRef.current = false;
    };
    let touchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchY === null) return;
      const y = e.touches[0]?.clientY ?? touchY;
      if (y > touchY + 4) stickToBottomRef.current = false; // drag down = scroll up
      touchY = y;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Home") {
        stickToBottomRef.current = false;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    // Instant jump (not smooth) — per-token updates would otherwise never
    // let a smooth-scroll animation finish.
    el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // Growth that bypasses `messages` (reasoning panel animating open, images
  // loading, markdown reflow, cards expanding) used to un-pin the view
  // mid-stream — observe the column's size and re-pin while stuck to bottom.
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    const col = contentRef.current;
    if (!el || !col) return;
    const ro = new ResizeObserver(() => {
      if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(col);
    return () => ro.disconnect();
  }, []);

  // Kit-fidelity fix (audit 2026-08-28): scroll to bottom on RUN START
  // even when the user had scrolled up (runStart → scheduleScrollToBottom).
  // Without this, sending a message
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

  // Auto-retry once on a failed run before surfacing the error card: the card
  // shows "retrying…" during the pause and the manual button only if the
  // second attempt also fails. Keyed per trailing message id so a new turn
  // gets its own free retry.
  const [autoRetrying, setAutoRetrying] = useState(false);
  const autoRetriedRef = useRef<string | null>(null);
  useEffect(() => {
    if (status !== "error") return;
    const last = messages[messages.length - 1];
    const key = last?.id ?? "empty";
    if (autoRetriedRef.current === key) return;
    autoRetriedRef.current = key;
    setAutoRetrying(true);
    const t = setTimeout(() => {
      setAutoRetrying(false);
      if (last) chat.regenerateMessage(last.id);
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, messages]);

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
        <div ref={contentRef} className="max-w-3xl mx-auto py-6">
        {/* serverStreaming (reopened mid-generation): the live mirror patches
            the last bubble's parts; render it as streaming so the caret +
            reasoning panel behave like a live turn. */}
        {renderTranscript(messages, chat.serverStreaming ? "streaming" : status, firstSeenRef.current)}
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
            className="my-3"
          />
        )}
        {isThinking && <ThinkingMessage />}
        {status === "error" && (
          <ErrorState
            title="That didn't go through"
            detail="The reply errored or stalled mid-stream. Retry re-runs the last turn — your chat is intact."
            retrying={autoRetrying}
            onRetry={() => {
              const last =
                [...messages].reverse().find((m) => m.role === "assistant") ??
                messages[messages.length - 1];
              if (last) chat.regenerateMessage(last.id);
            }}
            className="mt-3"
          />
        )}
        {/* Floating-composer clearance — taller while streaming so expanding
            cards (subagents, tools) never slide under the input bar. */}
        <div className={status === "streaming" || status === "submitted" ? "h-48" : "h-32"} />
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
 * Greeting — the empty-state centerpiece. Anti-slop pass (2026-08-31):
 * script font + glow bloom + mouse-follow removed; Geist display per
 * DESIGN.md (600 weight, negative tracking, sentence-case) with a single
 * amber period as the brand accent. Composer wide + centered, no suggestion
 * rows. Auto-unmounts the instant `messages.length > 0`.
 */
/** Time-of-day greeting lines — each bucket carries alternates; one picked
    per mount by hour+minute hash so it varies without a random API. */
const GREETINGS: { until: number; lines: string[] }[] = [
  { until: 5, lines: ["Moonlit chat?", "The den is quiet. Ask.", "Late hunt, good hunt."] },
  { until: 12, lines: ["Early bird. Let's hunt.", "Morning. Sharp light, sharp questions.", "Sun's up. So am I."] },
  { until: 17, lines: ["Prime hours. Ask away.", "Midday. Full stride.", "Daylight's burning — spend it here."] },
  { until: 21, lines: ["Golden hour. Golden questions.", "Evening. Winding down or ramping up?", "Dusk patrol. What do you need?"] },
  { until: 24, lines: ["Night owl? Me too.", "Moonlit chat?", "The quiet shift. I'm listening."] },
];

function pickGreeting(): string {
  const now = new Date();
  const bucket = GREETINGS.find((g) => now.getHours() < g.until) ?? GREETINGS[0];
  return bucket.lines[(now.getHours() * 60 + now.getMinutes()) % bucket.lines.length];
}

function Greeting() {
  // SSR/client clocks can disagree — render the neutral line on the server,
  // swap to the time-of-day line after mount.
  const [line, setLine] = useState("How can I help");
  useEffect(() => setLine(pickGreeting()), []);
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 relative isolate">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-3xl text-center"
      >
        <EmptyState className="max-w-3xl">
          <EmptyStateGreeting className="font-greeting mb-2 text-[34px] font-medium leading-[42px] tracking-[-0.02em] dark:text-[#ececec] light:text-[#171717]">
            {line}
            {!/[?!.]$/.test(line) && (
              <span className="dark:text-[#ffb400] light:text-[#d49600]">.</span>
            )}
          </EmptyStateGreeting>
          {/* Clone-style: composer wide + centered in the empty state; no
              suggestion rows (2026-08-31 operator). The bottom bar only
              exists once the thread has messages. */}
          <div className="mt-8 w-full max-w-3xl">
            <Composer placement="center" />
          </div>
        </EmptyState>
      </motion.div>
    </div>
  );
}
