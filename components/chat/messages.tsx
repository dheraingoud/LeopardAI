"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useActiveChat } from "@/hooks/use-active-chat";
import { PreviewMessage, ThinkingMessage, getMessageText } from "./message";
import { MessageRenderBoundary } from "./message-error-boundary";
import { TurnRail } from "./leopard/turn-rail";
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
        ["output-available", "approval-requested"].includes(
          (p as { state?: string }).state ?? "",
        )),
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
  // Approval-resume fork (2026-09-04): while the resume bubble streams, the
  // pre-approval bubble still carries the FIRST reasoning block — two thinking
  // panels (usually identical re-think) stack and read as a duplication bug.
  // Hide reasoning on every assistant message of the current turn except the
  // LAST one; at settle the tail-collapse merges them into one row anyway.
  let lastUserIdx = -1;
  let lastAssistantIdx = -1;
  messages.forEach((m, i) => {
    if (m.role === "user") lastUserIdx = i;
    if (m.role === "assistant") lastAssistantIdx = i;
  });
  // Dedupe by id before rendering — the mirror can push a duplicate between
  // the mirror effect and the dedupe effect's setMessages. React warns on
  // duplicate keys; the dedupe here catches it before render.
  const seenIds = new Set<string>();
  const dedupedMessages = messages.filter((m) => {
    if (seenIds.has(m.id)) return false;
    seenIds.add(m.id);
    return true;
  });
  dedupedMessages.forEach((message, index) => {
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
      // Per-message error boundary (audit 2026-10-09): a throwing renderer
      // (mermaid/KaTeX/chart edge case) must not unmount the whole transcript.
      <MessageRenderBoundary key={`${message.id}-${index}`}>
      <PreviewMessage
        message={message}
        isLast={index === dedupedMessages.length - 1}
        status={status}
        hideReasoning={
          message.role === "assistant" &&
          index > lastUserIdx &&
          index !== lastAssistantIdx &&
          lastAssistantIdx > lastUserIdx
        }
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
      />
      </MessageRenderBoundary>,
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
  // Sync-seed on render (idempotent by id — StrictMode double-pass is a no-op)
  // AND keep fresh ids flowing via effect; renderTranscript reads the map
  // during render, so a pure-effect version mislabels the first paint (audit
  // 2026-10-09 note: render-body mutation was flagged impure; the id-keyed
  // guard makes it referentially safe — first stamp wins).
  for (const m of messages) {
    if (!firstSeenRef.current.has(m.id))
      firstSeenRef.current.set(
        m.id,
        // Persisted rows carry their real createdAt via metadata (mirror) —
        // stamp that, not first-render time, or a reloaded history groups
        // every old message under "Today".
        (m.metadata as { createdAt?: number } | undefined)?.createdAt ??
          Date.now(),
      );
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
    // Z4 (2026-10-10): the banner set at the ready transition, but a later
    // mirror patch can fill the bubble (the server's abort-finalize lands
    // after the local ready) — the banner then said "Stopped" over a bubble
    // with real content. Clear it the moment the tracked bubble gains text.
    if (stoppedId) {
      const tracked = messages.find((m) => m.id === stoppedId);
      if (tracked && hasVisibleText(tracked)) setStoppedId(null);
    }
  }, [status, messages, stoppedId]);

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
    // Guard on ghost: an unconditional setGhost(null) in a [status, messages]
    // effect re-fires on every messages identity change; paired with the
    // provider's setMessages effects it fed the update-depth loop (2026-09-06).
    if ((status === "ready" || status === "error") && ghost !== null) setGhost(null);
  }, [status, messages, ghost]);

  // Reasoning-panel expand/collapse dispatches per-frame height deltas; hold
  // the reading anchor when NOT pinned to the bottom.
  // aui adoption (useScrollLock): reasoning panel now locks scroll via
  // useScrollLock — no need for the custom event listener.

  const showGhost =
    ghost !== null && !messages.some((m) => m.id === ghost.id);

  // Kit scroll-anchor: count messages that arrived while unpinned; the pill
  // jumps to bottom + repins. Streaming growth counts too (audit 2026-10-09,
  // deep-sweep #10): a long streamed answer used to grow the transcript with
  // the pill hidden because message COUNT never changed.
  const [unseen, setUnseen] = useState(0);
  const prevCountRef = useRef(messages.length);
  const prevStreamLenRef = useRef(0);
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = messages.length;
    const last = messages[messages.length - 1];
    const streamLen = last?.role === "assistant"
      ? last.parts.reduce((n, p) => n + ((p as { text?: string }).text?.length ?? 0), 0)
      : 0;
    const grew = streamLen - prevStreamLenRef.current;
    prevStreamLenRef.current = streamLen;
    if (stickToBottomRef.current) return;
    if (messages.length > prev) {
      setUnseen((u) => u + (messages.length - prev));
    } else if (grew > 400) {
      // Streamed content while scrolled up: the reply-in-flight counts as ONE
      // message regardless of how many chunks landed (the pill said "5 new
      // messages" for a single long answer — 2026-10-12 audit).
      setUnseen((u) => Math.max(u, 1));
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
      // aui adoption: don't unpin when the user is scrolling inside a text
      // field (ArrowUp in the composer textarea recalls history, not scrolls).
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable)
      )
        return;
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
  // aui adoption (useThreadViewportAutoScroll): expanding a collapsible
  // (reasoning panel, tool card) means the user is INSPECTING it — pause
  // bottom-follow so the ResizeObserver re-pin doesn't fight them.
  const inspectingRef = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onToggle = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "DETAILS") inspectingRef.current = (t as HTMLDetailsElement).open;
    };
    el.addEventListener("toggle", onToggle, true); // capture — toggle doesn't bubble
    return () => el.removeEventListener("toggle", onToggle, true);
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    const col = contentRef.current;
    if (!el || !col) return;
    const ro = new ResizeObserver(() => {
      if (stickToBottomRef.current && !inspectingRef.current) el.scrollTop = el.scrollHeight;
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

  // Auto-retry state lives in use-active-chat (QA M5) so the composer flips to
  // the stop state during the retry window — here we only render it.
  const autoRetrying = chat.retrying;

  const isThinking = status === "submitted";

  // Turn rail (2026-10-09, ported conversation-map): a tick rail on the
  // transcript edge for jumping between user turns. Only worth rendering on
  // threads long enough to scroll meaningfully (≥3 user turns).
  const userTurns = messages.filter((m) => m.role === "user");
  const railEntries = userTurns.map((m, i) => ({
    id: m.id,
    title: `Turn ${i + 1}`,
    preview: getMessageText(m).slice(0, 140),
  }));

  // Rail active state: the user turn whose pair is nearest the viewport top
  // (the one you're reading). Without visibleIds/activeId the rail's ticks
  // never marked a current turn (2026-10-12 audit). Hooks must live above the
  // empty-state early return below (rules-of-hooks).
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || railEntries.length < 3) return;
    const update = () => {
      const pairs = root.querySelectorAll('[data-slot="message-pair"]');
      const top = root.getBoundingClientRect().top;
      let best: string | null = null;
      let bestDist = Infinity;
      pairs.forEach((pair, idx) => {
        const r = (pair as HTMLElement).getBoundingClientRect();
        if (r.bottom < top || r.top > top + root.clientHeight) return;
        const d = Math.abs(r.top - top);
        if (d < bestDist) {
          bestDist = d;
          best = userTurns[idx]?.id ?? null;
        }
      });
      if (best) setActiveTurnId(best);
    };
    update();
    root.addEventListener("scroll", update, { passive: true });
    return () => root.removeEventListener("scroll", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railEntries.length, messages.length]);

  if (messages.length === 0) {
    return <Greeting />;
  }
  // Scroll by user-turn index: the i-th user message maps to the i-th
  // message-pair (pairs lead with the user bubble; regen-only assistant rows
  // are rare enough that an off-by-one still lands in view).
  const scrollToTurn = (id: string) => {
    const idx = userTurns.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const pairs = scrollRef.current?.querySelectorAll('[data-slot="message-pair"]');
    const target = pairs?.[Math.min(idx, (pairs?.length ?? 1) - 1)];
    (target as HTMLElement | undefined)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        // a11y (audit 2026-10-10): the transcript is the main content region —
        // role=log + aria-live=polite announces new messages to ATs; the
        // scrollable container needs a name.
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6"
      >
        {railEntries.length >= 3 && (
          <div className="pointer-events-none absolute right-1 top-0 bottom-0 z-10 hidden sm:flex">
            <div className="pointer-events-auto sticky top-1/2 -translate-y-1/2 self-start">
              <TurnRail
                entries={railEntries}
                activeId={activeTurnId ?? undefined}
                onSelect={scrollToTurn}
                className="h-40"
              />
            </div>
          </div>
        )}
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
        {/* Context-compaction notice (audit 2026-10-09, deep-sweep #13): the
            route folds old history into a summary when compaction is on —
            without a chip the context silently shrank with zero signal. */}
        {chat.compactionNotice && (
          <div className="my-3 inline-flex items-center gap-3 rounded-lg border border-foreground/[0.1] bg-foreground/[0.04] px-3 py-1.5 text-[12px] text-foreground/60">
            <span>Earlier messages were summarized to fit the context window.</span>
            <button
              type="button"
              className="rounded-md px-1.5 py-0.5 font-medium hover:bg-foreground/[0.08]"
              onClick={() => chat.dismissCompactionNotice()}
              aria-label="Dismiss compaction notice"
            >
              ×
            </button>
          </div>
        )}
        {/* Truncation banner (audit 2026-10-09): the route stamps
            data-truncated when finish_reason==="length" (maxOutputTokens hit).
            Without it a mid-sentence cut-off read as a clean completion. */}
        {(() => {
          const last = messages[messages.length - 1];
          const truncated =
            status !== "streaming" &&
            status !== "submitted" &&
            last?.role === "assistant" &&
            last.parts.some((p) => (p as { type?: string }).type === "data-truncated");
          if (!truncated) return null;
          return (
            <div className="my-3 inline-flex items-center gap-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-3 py-1.5 text-[12px] text-amber-600 dark:text-amber-400">
              <span>The reply hit the length limit and was cut off.</span>
              <button
                type="button"
                className="rounded-md border border-amber-500/30 px-2 py-0.5 font-medium hover:bg-amber-500/10"
                onClick={() => chat.regenerateMessage(last.id)}
              >
                Continue
              </button>
            </div>
          );
        })()}
        {/* Stall/reconnect signal: the server is retrying a hung upstream
            (kimi/deepseek headers-timeout pattern). Without this the user saw a
            frozen "Working on it…" for 40s+ with no explanation (audit 2026-10-06). */}
        {chat.stallSignal && status !== "error" && (
          <div className="my-3 inline-flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-3 py-1.5 text-[12px] text-amber-600 dark:text-amber-400">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
            </span>
            Reconnecting — the model stalled. Retrying
            {/* attempt A with maxRetries R left = attempt A of A+R total */}
            {chat.stallSignal.maxRetries > 0
              ? ` (${chat.stallSignal.attempt + 1}/${chat.stallSignal.attempt + chat.stallSignal.maxRetries})`
              : "…"}
          </div>
        )}
        {status === "error" && !autoRetrying && (() => {
          // Specific copy beats a generic "try again" — a dead key / dead fleet
          // tells the user the real problem (2026-10-05 silent-403 incident).
          const reason = chat.lastErrorReason ?? "";
          // Route-gate failures throw the JSON body (no status digits), so match
          // the literal error codes too — else a dead key shows generic copy.
          const isAuth = /\b(401|403)\b|Authorization failed|Forbidden|API key|not configured|unauthorized|model_not_allowed|not enabled/i.test(reason);
          const isRate = /\b429\b|rate.?limit|Too Many Requests|daily_token_cap/i.test(reason);
          const detail = isAuth
            ? "The model service rejected the request (the API key may be out of credits or expired). Fix the key, then retry — your chat is intact."
            : isRate
              ? "The model service is rate-limiting right now. Wait a moment, then retry — your chat is intact."
              : "The reply errored or stalled mid-stream. Retry re-runs the last turn — your chat is intact.";
          return (
            <ErrorState
              title="That didn't go through"
              detail={detail}
              retrying={false}
              onRetry={() => {
                const last =
                  [...messages].reverse().find((m) => m.role === "assistant") ??
                  messages[messages.length - 1];
                if (last) chat.regenerateMessage(last.id);
              }}
              className="mt-3"
            />
          );
        })()}
        {/* Floating-composer clearance — taller while streaming or errored so
            expanding cards + the error card never slide under the input bar. */}
        <div className={status === "streaming" || status === "submitted" || status === "error" ? "h-48" : "h-32"} />
        </div>
      </div>
      {/* QA M5 — retry indicator floats above the composer (like the scroll
          pill) instead of sitting in the transcript flow where attachment
          chips push the composer over it. bottom-36 clears composer+chips. */}
      {status === "error" && autoRetrying && (
        <div className="pointer-events-none absolute inset-x-0 bottom-44 z-10 flex justify-center">
          <ErrorState
            title="That didn't go through"
            detail="The reply errored or stalled mid-stream. Retrying…"
            retrying
            onRetry={() => {}}
            className="mt-0"
          />
        </div>
      )}
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
          {/* Keyboard hint (audit 2026-10-10): ⌘K + / exist but had no
              in-app discoverability — the greeting is the natural spot. */}
          <p className="mt-6 text-center font-mono text-[10px] dark:text-[#3a3a3a] light:text-[#737373]">
            <kbd className="rounded bg-foreground/[0.05] px-1.5 py-0.5">⌘/Ctrl K</kbd>{" "}
            palette · <kbd className="rounded bg-foreground/[0.05] px-1.5 py-0.5">/</kbd>{" "}
            skills · <kbd className="rounded bg-foreground/[0.05] px-1.5 py-0.5">@</kbd>{" "}
            recent chats
          </p>
        </EmptyState>
      </motion.div>
    </div>
  );
}
