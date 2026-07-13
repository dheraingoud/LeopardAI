"use client";

type Props = {
  contextWindow?: number;
  text: string;
  attachmentCount: number;
};

/** No client tokenizer yet — rough estimate: chars/4 + 200 tokens/attachment. */
function estimateTokens(text: string, attachments: number): number {
  return Math.round(text.length / 4) + attachments * 200;
}

/**
 * ContextIndicator — visible capacity ring sandwiched between the reasoning
 * control and the send button. A 22px circular SVG ring fills clockwise with
 * the used fraction of the context window; stroke turns amber >60% and red
 * >90%. When contextWindow is unknown (no metadata) a muted solid ring + "?"
 * renders so the slot keeps a fixed footprint instead of collapsing to an
 * invisible hairline. Tokens used/total ride the hover title.
 */
export function ContextIndicator({ contextWindow, text, attachmentCount }: Props) {
  const known = typeof contextWindow === "number" && contextWindow > 0;
  const used = estimateTokens(text, attachmentCount);
  const pct = known ? Math.min(1, used / contextWindow) : 0;
  const tone = !known
    ? "#5a5a5a"
    : pct > 0.9
      ? "#ff5555"
      : pct > 0.6
        ? "#ffb400"
        : "#737373";

  const R = 8;
  const C = 2 * Math.PI * R;
  const dash = pct * C;

  return (
    <div
      className="shrink-0 flex items-center self-center"
      title={
        known
          ? `${used.toLocaleString()} / ${contextWindow.toLocaleString()} tokens (est.)`
          : "context window unknown"
      }
    >
      <svg width="22" height="22" viewBox="0 0 22 22" className="overflow-visible">
        <circle
          cx="11"
          cy="11"
          r={R}
          fill="none"
          strokeWidth="2"
          className="dark:stroke-white/[0.10] light:stroke-black/[0.10]"
        />
        <circle
          cx="11"
          cy="11"
          r={R}
          fill="none"
          stroke={tone}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C - dash}`}
          transform="rotate(-90 11 11)"
          className="transition-all duration-300"
        />
        {!known && (
          <text
            x="11"
            y="14"
            textAnchor="middle"
            className="dark:fill-[#737373] light:fill-[#737373]"
            style={{ font: "bold 9px ui-monospace, monospace" }}
          >
            ?
          </text>
        )}
      </svg>
      {pct > 0.6 && known && (
        <span
          className="ml-1 text-[9px] font-mono tabular-nums"
          style={{ color: tone }}
        >
          {Math.round(pct * 100)}
        </span>
      )}
    </div>
  );
}
