"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Brain, ChevronRight, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContextIndicator } from "../context-indicator";
import { useActiveChat } from "@/hooks/use-active-chat";
import { estimateTokens, getContextBudget } from "@/lib/token-estimator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mono, paper } from "./surfaces";

// Click the composer's context ring → popover card breaking down WHAT fills the
// window: system / history / attachments / composer / output reserve. History
// expands to per-message rows. Honest math only — tool/schema costs are opaque
// client-side, so they're not fabricated.

const TINT = {
  system: "bg-[#71717a]",
  history: "bg-[#a78bfa]",
  attach: "bg-[#fb7185]",
  composer: "bg-[#22d3ee]",
  output: "bg-[#d4d4d4]",
};

const SYSTEM_RESERVE = 1000;
const RESPONSE_RESERVE = 3000;

const fmt = (n: number) => n.toLocaleString("en-US");

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

export function ContextBreakdown({ contextWindow, text, attachmentCount, attachments }: Props) {
  const chat = useActiveChat();
  const messages = chat.messages as Array<{
    id: string;
    role: string;
    parts: Array<{ type?: string; text?: string; mediaType?: string }>;
  }>;

  const [expanded, setExpanded] = useState(false);
  const known = typeof contextWindow === "number" && contextWindow > 0;

  const { rows, historyTokens } = useMemo(() => {
    const rows: Row[] = [];
    let total = 0;
    for (const m of messages) {
      const pieces = (m.parts ?? []) as Array<{ type?: string; text?: string; mediaType?: string }>;
      let body = "";
      let reasoning = "";
      let images = 0;
      for (const p of pieces) {
        if (p.type === "text" && typeof p.text === "string") body += p.text;
        else if (p.type === "reasoning" && typeof p.text === "string") reasoning += p.text;
        else if (p.type === "file" && (p.mediaType ?? "").startsWith("image/")) images += 1;
      }
      const preview = (body.trim() || reasoning.trim());
      const tokens = estimateTokens(body + "\n" + reasoning) + 4 + images * 85;
      total += tokens;
      rows.push({
        id: m.id,
        role: m.role === "user" ? "user" : "assistant",
        tokens,
        preview: preview.length > 140 ? preview.slice(0, 140).trimEnd() + "…" : preview,
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
  const limit = known ? contextWindow : 0;
  const pressure = known ? Math.min(1, dynamicUsed / limit) : 0;

  const budget = known ? getContextBudget(contextWindow) : null;
  const nearLimit = budget !== null && historyTokens > budget * 0.9;
  const overshoot = known && fill > contextWindow;

  const segments = [
    { key: "system", label: "system & guardrails", tokens: SYSTEM_RESERVE, tint: TINT.system },
    { key: "history", label: `conversation · ${rows.length}`, tokens: historyTokens, tint: TINT.history },
    { key: "attach", label: `attachments · ${attachments.length}`, tokens: attachTokens, tint: TINT.attach },
    { key: "composer", label: "composer (typing)", tokens: composerTokens, tint: TINT.composer },
    { key: "output", label: "output reserve", tokens: RESPONSE_RESERVE, tint: TINT.output },
  ];
  const share = (tokens: number) => (known ? Math.max(1.5, (tokens / limit) * 100) : 0);

  return (
    <Popover>
      <PopoverTrigger aria-label="Context usage" className="block shrink-0">
        <ContextIndicator
          contextWindow={contextWindow}
          text={text}
          attachmentCount={attachmentCount}
        />
      </PopoverTrigger>

      <PopoverContent side="top" align="end" sideOffset={8} className="w-[300px]">
        <div data-slot="context-breakdown" className={cn(paper, "flex w-full flex-col gap-3 rounded-2xl p-4")}>
          <div className="flex items-baseline justify-between">
            <span className="text-[13.5px] font-medium dark:text-[#e5e5e5] light:text-[#262626]">Context</span>
            <span
              className={cn(
                mono,
                "tabular-nums",
                pressure > 0.85
                  ? "dark:text-[#ffb400] light:text-[#d49600]"
                  : "dark:text-[#606060] light:text-[#8a8a8a]",
              )}
            >
              {known ? `${fmt(dynamicUsed)} / ${fmt(limit)}` : "window unknown"}
            </span>
          </div>

          <div className="flex h-2 w-full overflow-hidden rounded-full dark:bg-white/[0.05] light:bg-black/[0.06]">
            {segments.map((s) => (
              <span
                key={s.key}
                title={`${s.label} ${fmt(s.tokens)}`}
                className={cn("h-full transition-[width] duration-500 ease-out motion-reduce:transition-none", s.tint)}
                style={{ width: `${share(s.tokens)}%` }}
              />
            ))}
          </div>

          {(nearLimit || overshoot) && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2.5 py-1.5 font-mono text-[10px] leading-[1.5] dark:text-red-300 light:text-red-600">
              {overshoot
                ? "Over budget — trim history or attachments before sending."
                : "Near the context limit — older messages may be dropped on the next send."}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <LegendRow tint={TINT.system} label="system & guardrails" value={`~${fmt(SYSTEM_RESERVE)}`} />
            <button type="button" onClick={() => setExpanded((e) => !e)} className="w-full text-left">
              <LegendRow
                tint={TINT.history}
                label={`conversation · ${rows.length}`}
                value={fmt(historyTokens)}
                right={
                  <ChevronRight
                    className={cn("size-3 dark:text-[#606060] light:text-[#8a8a8a] transition-transform", expanded && "rotate-90")}
                  />
                }
              />
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
                      <p className={cn(mono, "px-1 pt-1 dark:text-[#505050] light:text-[#9a9a9a]")}>
                        showing last 12 of {rows.length}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <LegendRow tint={TINT.attach} label={`attachments · ${attachments.length}`} value={fmt(attachTokens)} />
            <LegendRow tint={TINT.composer} label="composer (typing)" value={fmt(composerTokens)} />
            <LegendRow tint={TINT.output} label="output reserve" value={`~${fmt(RESPONSE_RESERVE)}`} />
            <LegendRow tint="bg-black/[0.08] dark:bg-white/[0.08]" label="headroom" value={fmt(Math.max(0, limit - fill))} />
          </div>

          <div className="flex items-center justify-between border-t pt-2 dark:border-white/[0.05] light:border-black/[0.06]">
            <span className={cn(mono, "dark:text-[#505050] light:text-[#9a9a9a]")}>
              {pressure > 0 ? `${Math.round(pressure * 100)}% of window used` : "estimates — chars/≈4"}
            </span>
            <span className={cn(mono, "dark:text-[#505050] light:text-[#9a9a9a]")}>Esc to close</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LegendRow({ tint, label, value, right }: { tint: string; label: string; value: string; right?: ReactNode }) {
  return (
    <div className="-mx-1 flex items-center gap-2 rounded-md px-1 hover:dark:bg-white/[0.03] hover:light:bg-black/[0.02]">
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", tint)} />
      <span className="min-w-0 flex-1 truncate text-[13px] dark:text-[#9a9a9a] light:text-[#4a4a4a]">{label}</span>
      {right ?? <span className={cn(mono, "shrink-0 tabular-nums dark:text-[#606060] light:text-[#8a8a8a]")}>{value}</span>}
    </div>
  );
}

function HistoryRow({ row }: { row: Row }) {
  const Icon = row.role === "user" ? User : row.hasReasoning ? Brain : Bot;
  return (
    <div className="flex items-start gap-1.5 rounded-md px-1 py-0.5 hover:dark:bg-white/[0.03] hover:light:bg-black/[0.02]">
      <span
        className={cn(
          "mt-px flex size-3.5 shrink-0 items-center justify-center rounded-[4px]",
          row.role === "user"
            ? "bg-[#ffb400]/15 dark:text-[#ffb400] light:text-[#d49600]"
            : "dark:bg-white/[0.08] light:bg-black/[0.06] dark:text-[#a3a3a3] light:text-[#525252]",
        )}
      >
        <Icon className="size-2" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate font-mono text-[10px] leading-[1.4]",
            row.role === "user" ? "dark:text-[#d9d9d9] light:text-[#333]" : "dark:text-[#828282] light:text-[#666]",
          )}
        >
          {row.preview || (row.role === "user" ? "user message" : "assistant reply")}
        </span>
        <span className={cn(mono, "block tabular-nums dark:text-[#4a4a4a] light:text-[#9a9a9a]")}>
          {fmt(row.tokens)} tokens
        </span>
      </span>
    </div>
  );
}
