"use client";

import { useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Brain, ChevronDown, Pin, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContextIndicator } from "./context-indicator";
import { useActiveChat } from "@/hooks/use-active-chat";
import { estimateTokens, getContextBudget } from "@/lib/token-estimator";

// ═══════════════════════════════════════════════════════════════════════════
// ContextDescriptor — hover popover that explains WHAT is filling the context
// window (the composer's token ring is just a %; this is the "why"):
//
//   system  · the system prompt + guardrail reserve      (zinc)
//   history · prior messages, one row per message         (violet)
//   attach  · image/file attachments on the next send     (rose)
//   composer· the text you're currently typing            (cyan)
//   output  · reserved room for the assistant's reply     (faint)
//
// A horizontal stacked bar scales each bucket against the FULL window so you
// see at a glance where the budget goes; each history row is one message with a
// role-coloured dot + token count + collapsed preview. Expands to a per-message
// list on demand (docs/context-window.md → the `/context` colored-grid pattern,
// re-implemented for a web composer). Hover to peek, click the ring to pin;
// Esc / clicking outside dismisses.
//
// The value is honest + computable — tools/CLAUDE.md-style costs are opaque
// client-side so we deliberately don't fabricate them (docs expose no
// per-image/per-tool token metering either).
// ═══════════════════════════════════════════════════════════════════════════

// Palette — Leopard cohesive: amber = active/send/reasoning, the ring's red
// overload, the tool-result blue. Bucket hues are desaturated on purpose so the
// card reads premium, not neon.
const C = {
  system: "#71717a", // zinc-500
  history: "#a78bfa", // violet-400
  attach: "#fb7185", // rose-400
  composer: "#22d3ee", // cyan-400
  output: "#d4d4d4", // neutral-300 (kept faint in dark)
  overshoot: "#ff5555", // ring overload red
};

const SYSTEM_RESERVE = 1000;
const RESPONSE_RESERVE = 3000;

/** One analysed message → its context cost + a preview label. */
type Row = {
  id: string;
  role: "user" | "assistant";
  tokens: number;
  preview: string;
  hasReasoning: boolean;
};

type Props = {
  contextWindow?: number;
  text: string;
  attachmentCount: number;
  attachments: { name: string; mediaType: string }[];
};

export function ContextDescriptor({ contextWindow, text, attachmentCount, attachments }: Props) {
  const chat = useActiveChat();
  const messages = chat.messages as Array<{
    id: string;
    role: string;
    parts: Array<{ type?: string; text?: string; mediaType?: string }>;
  }>;

  const [pinned, setPinned] = useState(false);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const known = typeof contextWindow === "number" && contextWindow > 0;

  // ── Per-message + bucket token math (parity with token-estimator) ─────────
  const { rows, historyTokens } = useMemo(() => {
    const rows: Row[] = [];
    let total = 0;
    for (const m of messages) {
      const pieces = (m.parts ?? []) as Array<{ type?: string; text?: string; mediaType?: string }>;
      let text = "";
      let reasoning = "";
      let images = 0;
      for (const p of pieces) {
        if (p.type === "text" && typeof p.text === "string") text += p.text;
        else if (p.type === "reasoning" && typeof p.text === "string") reasoning += p.text;
        else if (p.type === "file" && (p.mediaType ?? "").startsWith("image/")) images += 1;
      }
      const body = text.trim() || reasoning.trim();
      const tokens =
        estimateTokens(text + "\n" + reasoning) +
        4 +
        images * 85;
      total += tokens;
      rows.push({
        id: m.id,
        role: m.role === "user" ? "user" : "assistant",
        tokens,
        preview: body.length > 140 ? body.slice(0, 140).trimEnd() + "…" : body,
        hasReasoning: reasoning.trim().length > 0,
      });
    }
    return { rows, historyTokens: total };
  }, [messages]);

  const attachTokens = useMemo(
    () =>
      attachments.reduce((s, a) => {
        if (a.mediaType.startsWith("image/")) return s + 85;
        return s + Math.max(50, estimateTokens(a.name)) + 4;
      }, 0),
    [attachments],
  );
  const composerTokens = estimateTokens(text) + (text.trim() ? 4 : 0);

  const dynamicUsed = historyTokens + attachTokens + composerTokens;
  const fill = SYSTEM_RESERVE + dynamicUsed + RESPONSE_RESERVE;
  const pct = known ? Math.min(1, dynamicUsed / contextWindow) : 0;

  const budget = known ? getContextBudget(contextWindow) : null;
  const nearLimit = budget !== null && historyTokens > budget * 0.9;

  // Stacked bar segments (scaled to the full window when known).
  const seg = (tokens: number) => (known ? Math.max(1.5, (tokens / contextWindow) * 100) : 0);
  // Keep the numbers honest: segments are their own % against the full window;
  // a fill above the window clips the bar (overflow-hidden) + flags overshoot.
  const overshoot = known && fill > contextWindow;

  const beginClose = useCallback(() => {
    if (pinned) return;
    closeTimer.current = window.setTimeout(() => setOpen(false), 220);
  }, [pinned]);
  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  return (
    <div
      className="relative hidden sm:block"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={beginClose}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          cancelClose();
          setPinned((p) => !p);
          setOpen((o) => !pinned || !o);
        }}
        className="shrink-0 block"
      >
        <ContextIndicator
          contextWindow={contextWindow}
          text={text}
          attachmentCount={attachmentCount}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onMouseEnter={cancelClose}
            onMouseLeave={beginClose}
            className="absolute bottom-full right-0 mb-2 z-40 w-[300px] origin-bottom-right"
          >
            <div className="overflow-hidden rounded-2xl border dark:border-white/[0.09] light:border-black/[0.09] dark:bg-[#0a0a0a]/95 light:bg-white/95 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_44px_-18px_rgba(0,0,0,0.6)]">
              {/* Header — used / total + status */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] dark:text-[#c9c9c9] light:text-[#2a2a2a]">
                  context window
                </span>
                <span className="text-[10px] font-mono tabular-nums dark:text-[#707070] light:text-[#8a8a8a]">
                  {known
                    ? `${dynamicUsed.toLocaleString()} / ${contextWindow.toLocaleString()} tokens`
                    : "window unknown"}
                </span>
              </div>

              {/* Stacked bar (full window = 100%) */}
              <div className="px-4 pb-1">
                <div className="flex h-[7px] w-full overflow-hidden rounded-full bg-black/[0.06] light:bg-black/[0.06] dark:bg-white/[0.05]">
                  <div style={{ width: `${seg(SYSTEM_RESERVE)}%`, background: C.system }} title={`system ${SYSTEM_RESERVE}`} />
                  <div style={{ width: `${seg(historyTokens)}%`, background: C.history }} title={`history ${historyTokens}`} />
                  <div style={{ width: `${seg(attachTokens)}%`, background: C.attach }} title={`attachments ${attachTokens}`} />
                  <div style={{ width: `${seg(composerTokens)}%`, background: C.composer }} title={`composer ${composerTokens}`} />
                  <div style={{ width: `${seg(RESPONSE_RESERVE)}%`, background: C.output, opacity: 0.65 }} title={`output reserve ${RESPONSE_RESERVE}`} />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono uppercase tracking-tighter text-[#707070]">
                  <span className="flex items-center gap-1">
                    <i className="h-2 w-2 rounded-sm" style={{ background: C.history }} /> history
                  </span>
                  <span className="flex items-center gap-1">
                    <i className="h-2 w-2 rounded-sm" style={{ background: C.attach }} /> attach
                  </span>
                  <span className="flex items-center gap-1">
                    <i className="h-2 w-2 rounded-sm" style={{ background: C.composer }} /> typing
                  </span>
                  <span className="flex items-center gap-1">
                    <i className="h-2 w-2 rounded-sm" style={{ background: C.output }} /> reply
                  </span>
                </div>
              </div>

              {nearLimit && (
                <div className="mx-4 mt-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2.5 py-1.5 text-[10px] leading-[1.5] font-mono dark:text-red-300 light:text-red-600">
                  Near the context limit — older messages may be dropped on the next send.
                </div>
              )}
              {overshoot && (
                <div className="mx-4 mt-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2.5 py-1.5 text-[10px] leading-[1.5] font-mono dark:text-red-300 light:text-red-600">
                  Over budget — trim history or attachments before sending.
                </div>
              )}

              {/* Legend rows with live token per bucket */}
              <div className="px-4 pt-2 pb-1 space-y-1 text-[11px] leading-[1.5]">
                <LegendRow color={C.system} label="system & guardrails" value={`~${SYSTEM_RESERVE.toLocaleString()}`} />
                <button type="button" onClick={() => setExpanded((e) => !e)} className="w-full text-left">
                  <div className="flex items-center justify-between rounded-md px-1 -mx-1 hover:dark:bg-white/[0.03] hover:light:bg-black/[0.02]">
                    <LegendRow color={C.history} label={`conversation · ${rows.length}`} value={`${historyTokens.toLocaleString()}`} right={<ChevronDown className={cn("h-3 w-3 text-[#606060] transition-transform", expanded && "rotate-180")} />} />
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="max-h-[160px] space-y-0.5 overflow-y-auto pt-0.5">
                        {rows.slice(-12).map((r) => (
                          <HistoryRow key={r.id} row={r} />
                        ))}
                        {rows.length > 20 && (
                          <p className="px-1 pt-1 text-[9px] font-mono dark:text-[#505050] light:text-[#9a9a9a]">
                            showing last {12} of {rows.length}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <LegendRow color={C.attach} label={`attachments · ${attachments.length}`} value={`${attachTokens.toLocaleString()}`} />
                <LegendRow color={C.composer} label="composer (typing)" value={`${composerTokens.toLocaleString()}`} />
                <LegendRow color={C.output} label="output reserve" value={`~${RESPONSE_RESERVE.toLocaleString()}`} />
              </div>

              <div className="flex items-center justify-between border-t px-4 py-1.5 dark:border-white/[0.05] light:border-black/[0.06]">
                <span className="text-[9px] font-mono dark:text-[#505050] light:text-[#9a9a9a]">
                  {pct > 0 ? `${Math.round(pct * 100)}% of window used` : "estimates — chars/≈4"}
                </span>
                <span className="flex items-center gap-1 text-[9px] font-mono dark:text-[#505050] light:text-[#9a9a9a]">
                  <Pin className={cn("h-2.5 w-2.5", pinned && "text-[#ffb400]")} />
                  {pinned ? "pinned" : "hover"}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One colour + label + right-aligned token count legend row. */
function LegendRow({
  color,
  label,
  value,
  right,
}: {
  color: string;
  label: string;
  value: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-1 -mx-1">
      <span className="flex min-w-0 items-center gap-1.5">
        <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate dark:text-[#9a9a9a] light:text-[#4a4a4a]">{label}</span>
      </span>
      {right ?? <span className="shrink-0 font-mono text-[10px] tabular-nums dark:text-[#606060] light:text-[#8a8a8a]">{value}</span>}
    </div>
  );
}

/** One expanded history row — role glyph, token count, collapsed preview. */
function HistoryRow({ row }: { row: Row }) {
  const Icon = row.role === "user" ? User : row.hasReasoning ? Brain : Bot;
  return (
    <div className="flex items-start gap-1.5 rounded-md px-1 py-0.5 hover:dark:bg-white/[0.03] hover:light:bg-black/[0.02]">
      <span
        className={cn(
          "mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px]",
          row.role === "user" ? "bg-[#ffb400]/15 text-[#ffb400]" : "dark:bg-white/[0.08] light:bg-black/[0.06] dark:text-[#a3a3a3] light:text-[#525252]",
        )}
      >
        <Icon className="h-2 w-2" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[10px] leading-[1.4] font-mono",
          row.role === "user" ? "dark:text-[#d9d9d9] light:text-[#333]" : "dark:text-[#828282] light:text-[#666]")}>
          {row.preview || (row.role === "user" ? "user message" : "assistant reply")}
        </span>
        <span className="block text-[9px] font-mono tabular-nums dark:text-[#4a4a4a] light:text-[#9a9a9a]">
          {row.tokens.toLocaleString()} tokens
        </span>
      </span>
    </div>
  );
}