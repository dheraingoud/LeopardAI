"use client";

import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { useActiveChat } from "@/hooks/use-active-chat";
import { getModelById } from "@/lib/ai/models";
import type { ReasoningLevel } from "@/lib/nim";
import { mono } from "./surfaces";

// Forked effort element, wired to leopard persistence: useActiveChat holds the
// pick per model; ReasoningConfig on the registry decides tiered vs binary.
// Locked-on / non-toggleable reasoners render nothing — the route sends no
// param for those and reasoning still streams.

export function levelLabel(l: ReasoningLevel): string {
  switch (l) {
    case "off":
      return "Off";
    case "on":
      return "On";
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "max":
      return "Max";
  }
}

export function ReasoningEffort() {
  const { currentModelId, currentReasoning, setReasoning } = useActiveChat();
  const cfg = getModelById(currentModelId)?.reasoningConfig;

  if (!cfg?.enabled || !cfg.toggleable || !cfg.param) return null;

  const active = currentReasoning !== undefined && currentReasoning !== "off";
  const stops = cfg.effortLevels as ReasoningLevel[] | undefined;

  if (stops && stops.length > 0) {
    const idx = active && stops.includes(currentReasoning) ? stops.indexOf(currentReasoning) : -1;
    return (
      <div data-slot="reasoning-effort" className="px-4 pb-3 pt-3">
        <div className="mb-2.5 flex items-center justify-between">
          <span className={cn(mono, "dark:text-[#a3a3a3] light:text-[#525252]")}>
            Reasoning effort
          </span>
          <span className={cn(mono, "text-[#ffb400]")}>
            {idx >= 0 ? levelLabel(stops[idx]) : "Off"}
          </span>
        </div>
        <Slider
          ariaLabel="Reasoning effort"
          min={-1}
          max={stops.length - 1}
          step={1}
          value={idx}
          accent="#ffb400"
          onValueChange={(v) => setReasoning(v < 0 ? "off" : stops[v])}
        />
        <div className="mt-2.5 flex justify-between text-[9px] font-mono dark:text-[#4a4a4a] light:text-[#9a9a9a]">
          <span className={cn(idx < 0 && "text-[#ffb400]")}>Off</span>
          {stops.map((s, i) => (
            <span key={s} className={cn(i === idx && "text-[#ffb400]")}>
              {levelLabel(s)}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div data-slot="reasoning-effort" className="min-w-[176px] px-2.5 py-1">
      {(["off", "on"] as ReasoningLevel[]).map((opt) => {
        const sel = (opt === "on" && active) || (opt === "off" && !active);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => setReasoning(opt)}
            className={cn(
              "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left font-mono text-[12px] transition-colors",
              sel
                ? "text-[#ffb400] dark:bg-[#ffb400]/12 light:bg-[#ffb400]/16"
                : "dark:text-[#a3a3a3] light:text-[#525252] hover:dark:bg-white/[0.05] hover:light:bg-black/[0.05]",
            )}
          >
            {opt === "on" ? "On" : "Off"}
            {sel && <span className="h-1.5 w-1.5 rounded-full bg-[#ffb400]" />}
          </button>
        );
      })}
    </div>
  );
}
