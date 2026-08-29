"use client";

/**
 * P2.4 · per-chat usage readout. Fetches /api/usage?chatId=<uuid> (fail-closed
 * guard, scoped to the caller's rows). The header chip opens a popover wiring
 * the kit forks to the same payload: NumberTicker (total tokens), CostMeter
 * (latest turn vs chat total, per-model split), ActivityGraph (turns/day from
 * row timestamps). Renders nothing without recorded usage.
 */
import { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CostMeter, type CostLine } from "./leopard/cost-meter";
import { NumberRoll } from "./leopard/primitives/number-roll";
import { ActivityGraph } from "./leopard/activity-graph";

type UsageRow = {
  model: string;
  ts: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs?: number;
  estimatedCostUsd?: number;
};

type Usage = {
  count: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  estimatedCostUsd: number;
  rows: UsageRow[];
};

const compact = (tokens: number): string =>
  tokens >= 100_000 ? `${(tokens / 1000).toFixed(0)}k` : `${Math.round(tokens / 100) / 10}k`;

const usd = (n: number): string => (n > 0 ? `$${n.toFixed(3)}` : "—");

const dayKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function UsageReadout({ chatId }: { chatId?: string }) {
  const [u, setU] = useState<Usage | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!chatId) return;
    let alive = true;
    setU(null);
    setGone(false);
    fetch(`/api/usage?chatId=${encodeURIComponent(chatId)}`)
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (alive && d && !d.error && d.count > 0) setU(d as Usage);
        else if (alive) setGone(true);
      })
      .catch(() => {
        if (alive) setGone(true);
      });
    return () => {
      alive = false;
    };
  }, [chatId]);

  // Per-model cost lines (share of chat tokens) + per-day turn counts, both
  // derived from the same rows the chip summarizes.
  const { lines, activity, firstDay } = useMemo(() => {
    const byModel = new Map<string, { input: number; output: number; tokens: number; cost: number }>();
    const byDay = new Map<string, number>();
    let min = Infinity;
    for (const r of u?.rows ?? []) {
      const m = byModel.get(r.model) ?? { input: 0, output: 0, tokens: 0, cost: 0 };
      m.input += r.inputTokens;
      m.output += r.outputTokens;
      m.tokens += r.totalTokens;
      m.cost += r.estimatedCostUsd ?? 0;
      byModel.set(r.model, m);
      const k = dayKey(r.ts);
      byDay.set(k, (byDay.get(k) ?? 0) + 1);
      if (r.ts < min) min = r.ts;
    }
    const lines: CostLine[] = [...byModel.entries()]
      .map(([model, v]) => ({
        model,
        inputTokens: v.input,
        outputTokens: v.output,
        cost: usd(v.cost),
        share: u && u.totalTokens > 0 ? v.tokens / u.totalTokens : 0,
      }))
      .sort((a, b) => b.share - a.share)
      .slice(0, 4);
    return {
      lines,
      activity: [...byDay.entries()].map(([date, count]) => ({ date, count })),
      firstDay: min === Infinity ? null : new Date(min),
    };
  }, [u]);

  if (gone || !u || u.count === 0) return null;

  const title = `${u.count} turn${u.count === 1 ? "" : "s"} · in ${u.totalInputTokens} / out ${u.totalOutputTokens} tok${u.totalDurationMs ? ` · ${(u.totalDurationMs / 1000).toFixed(0)}s` : ""}`;
  return (
    <Popover>
      <PopoverTrigger
        title={title}
        aria-label="Chat usage details"
        className="hidden sm:inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[10px] leading-none tracking-tight tabular-nums transition-colors dark:text-[#5f5f5f] light:text-[#a3a3a3] hover:dark:bg-white/[0.05] hover:light:bg-black/[0.04] hover:dark:text-[#a3a3a3] hover:light:text-[#525252]"
      >
        <span className="truncate max-w-[120px]">
          {u.count} {u.count === 1 ? "turn" : "turns"} · {compact(u.totalTokens)} tok
          {u.estimatedCostUsd > 0 ? ` · $${u.estimatedCostUsd.toFixed(3)}` : ""}
        </span>
      </PopoverTrigger>

      <PopoverContent side="bottom" align="end" sideOffset={8} className="w-[320px]">
        <div className="flex w-full flex-col gap-3 p-3">
          <div className="flex flex-col items-center gap-2.5 py-1">
            <NumberRoll
              value={u.totalTokens}
              className="text-2xl font-medium tracking-tight"
            />
            <span className="font-mono text-[11px] tracking-tight text-foreground/35">
              {`tokens · ${u.count} turn${u.count === 1 ? "" : "s"}`}
            </span>
          </div>
          <CostMeter
            className="max-w-none"
            runCost={usd(u.rows[0]?.estimatedCostUsd ?? 0)}
            sessionCost={usd(u.estimatedCostUsd)}
            lines={lines}
          />
          {firstDay && (
            <ActivityGraph
              className="max-w-none"
              data={activity}
              start={firstDay}
              end={new Date()}
              title="Turns per day"
              total={`${u.count} total`}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
