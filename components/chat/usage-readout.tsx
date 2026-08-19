"use client";

/**
 * P2.4 · per-chat usage readout. Fetches /api/usage?chatId=<uuid> (the same
 * fail-closed guard as the generation routes; scoped to the caller's own rows)
 * and renders a compact one-liner: turns · total tokens · estimated cost.
 * Renders nothing when the store is unavailable / chat has no recorded usage /
 * the id is absent — deliberately non-intrusive (the chat header shouldn't grow
 * chrome for an observability nicety).
 */
import { useEffect, useState } from "react";

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

  if (gone || !u || u.count === 0) return null;

  const title = `${u.count} turn${u.count === 1 ? "" : "s"} · in ${u.totalInputTokens} / out ${u.totalOutputTokens} tok${u.totalDurationMs ? ` · ${(u.totalDurationMs / 1000).toFixed(0)}s` : ""}`;
  return (
    <span
      className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] leading-none tracking-tight tabular-nums dark:text-[#5f5f5f] light:text-[#a3a3a3]"
      title={title}
    >
      <span className="truncate max-w-[120px]">
        {u.count} {u.count === 1 ? "turn" : "turns"} · {compact(u.totalTokens)} tok
        {u.estimatedCostUsd > 0 ? ` · $${u.estimatedCostUsd.toFixed(3)}` : ""}
      </span>
    </span>
  );
}