"use client";

import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { getModelById } from "@/lib/ai/models";
import { effortLabel, effortTiers } from "@/lib/ai/effort-tiers";
import type { ReasoningLevel } from "@/lib/nim";
import { mono } from "./surfaces";

// Forked effort element, props-driven (works outside the chat provider —
// settings page passes its own state). Locked-on / non-toggleable reasoners
// render nothing. Tiers come from the shared effort-tiers model so the
// settings control and the composer picker never disagree about a level.

export function levelLabel(l: ReasoningLevel): string {
  return effortLabel(l);
}

export function ReasoningEffort({
  modelId,
  value,
  onChange,
  className,
}: {
  modelId: string;
  value: ReasoningLevel | undefined;
  onChange: (level: ReasoningLevel) => void;
  /** Override the outer padding — the settings Section supplies its own
   *  inset, so it passes a flush value to kill the double-inset. */
  className?: string;
}) {
  const cfg = getModelById(modelId)?.reasoningConfig;
  const tiers = effortTiers(cfg);

  if (tiers.kind === "none") return null;

  const stops = tiers.levels;
  const idx = stops.findIndex((t) => t.id === value);

  if (tiers.kind === "binary") {
    return (
      <div data-slot="reasoning-effort" className="min-w-0 px-2.5 py-1">
        {stops.map((tier) => {
          const sel = tier.id === value;
          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => onChange(tier.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left font-mono text-[12px] transition-colors",
                sel
                  ? "text-[#ffb400] dark:bg-[#ffb400]/12 light:bg-[#ffb400]/16"
                  : "dark:text-[#a3a3a3] light:text-[#525252] hover:dark:bg-white/[0.05] hover:light:bg-black/[0.05]",
              )}
            >
              {tier.label}
              {sel && <span className="h-1.5 w-1.5 rounded-full bg-[#ffb400]" />}
            </button>
          );
        })}
      </div>
    );
  }

  const sliderMin = Math.min(tiers.canTurnOff ? 0 : 1, stops.length - 1);
  const sliderIdx = idx >= 0 ? idx : sliderMin;

  return (
    <div data-slot="reasoning-effort" className={cn("px-4 pb-3 pt-3", className)}>
      <div className="mb-2.5 flex items-center justify-between">
        <span className={cn(mono, "dark:text-[#a3a3a3] light:text-[#525252]")}>
          Reasoning effort
        </span>
        <span className={cn(mono, "text-[#ffb400]")}>
          {stops[sliderIdx]?.label ?? "Off"}
        </span>
      </div>
      <Slider
        ariaLabel="Reasoning effort"
        min={sliderMin}
        max={stops.length - 1}
        step={1}
        value={sliderIdx}
        accent="#ffb400"
        onValueChange={(v) => onChange(stops[Math.max(0, v)]?.id ?? stops[0].id)}
      />
      <div className="mt-2.5 flex justify-between text-[9px] font-mono dark:text-[#4a4a4a] light:text-[#9a9a9a]">
        {stops.map((s, i) => (
          <span key={s.id} className={cn(i === sliderIdx && "text-[#ffb400]")}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
