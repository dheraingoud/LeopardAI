"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassButton } from "@/components/ui/glass-button";
import {
  GlassPopover,
  GlassPopoverContent,
  GlassPopoverTrigger,
} from "@/components/ui/glass-popover";
import { GlassSlider } from "@/components/ui/glass-slider";
import type { ReasoningConfig } from "@/lib/nim";
import type { ReasoningLevel } from "@/lib/nim";

type ReasoningCaps = {
  enabled?: boolean;
  reasoningConfig?: ReasoningConfig;
};

type Props = {
  /** Active model id (per-model reasoning pick is persisted namespaced by this). */
  modelId: string;
  /** Capabilities entry for the active model (carries reasoningConfig). */
  caps: ReasoningCaps | undefined;
  /** Current reasoning level (from use-active-chat, per-model). */
  current: ReasoningLevel | undefined;
  /** Commit a new level (persists client-side in use-active-chat). */
  onChange: (level: ReasoningLevel) => void;
};

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

/**
 * ReasoningControl — THE THINKING BUTTON. The input-bar effort indicator +
 * liquid-glass adjust popover, built on the @liquid-glass primitives:
 *
 *   - Trigger is a GlassButton capsule (amber-tinted when reasoning is active,
 *     neutral frost when off) — press-gel + refracting glass. `GlassPopover`
 *     (@base-ui/react Menu) owns open/close, Esc, and click-away, so no
 *     custom document listeners are needed.
 *   - Effort tiers (effortLevels present, e.g. GLM low→max / DeepSeek
 *     high,max) → popover opens a refracting `GlassSlider` (amber accent, lens
 *     lifts clear on drag, rubber-bands off the ends). Leftmost detent = Off.
 *   - Binary on/off (param set + no effortLevels, e.g. Gemma / DiffusionGemma /
 *     binary-effort MiniMax-M3 / Step) → popover opens an amber-toned On/Off
 *     pair, no slider.
 *
 * Locked-on reasoners (toggleable:false / no param, e.g. Cosmos) or
 * reasoning-disabled models render NOTHING — they reason by architecture, the
 * route sends no param, and sendReasoning still surfaces their parts.
 * "if no reasoning then nothing."
 *
 * The closed state shows ONLY the current effort text ("max"/"low"/"on"/…)
 * + a chevron — no brain icon. Click opens the popover above the bar. The
 * selection persists client-side per model (use-active-chat localStorage) and
 * threads into the transport body so /api/chat can map it (see
 * nimReasoningProviderOptions in lib/ai/models.ts).
 */
export function ReasoningControl({ modelId, caps, current, onChange }: Props) {
  const cfg = caps?.reasoningConfig;
  const enabled = cfg?.enabled ?? false;

  const [open, setOpen] = useState(false);

  // modelId is namespacing only (per-model persistence lives in use-active-chat);
  // not a render dependency. Kept on the type for future per-model pivots.
  void modelId;

  // Locked-on or reasoning-disabled → no indicator at all.
  if (!enabled || !cfg || !cfg.toggleable || !cfg.param) return null;

  const active = current !== undefined && current !== "off";
  const tiered = (cfg.effortLevels?.length ?? 0) > 0;
  const label = active ? levelLabel(current as ReasoningLevel) : "Off";

  return (
    <div className="relative shrink-0 self-center">
      <GlassPopover open={open} onOpenChange={setOpen}>
        <GlassPopoverTrigger
          render={
            <GlassButton
              variant="capsule"
              size={32}
              tint={active ? 0.4 : 0.12}
              tintColor={active ? "255,180,0" : undefined}
              title={`Reasoning effort: ${label}`}
              className={cn(
                "transition-colors duration-200",
                active
                  ? "dark:text-[#f5f5f7] light:text-[#1d1d1f]"
                  : "dark:text-[#8a8a8a] light:text-[#5a5a5a]"
              )}
            />
          }
        >
          <span className="text-[10px] font-mono leading-none">{label}</span>
          <ChevronDown
            className={cn(
              "h-2.5 w-2.5 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </GlassPopoverTrigger>
        <GlassPopoverContent side="top" align="end" sideOffset={6} tint={0.6}>
          {tiered ? (
            <TieredPicker
              stops={cfg.effortLevels as ReasoningLevel[]}
              current={current as ReasoningLevel | undefined}
              onChange={onChange}
            />
          ) : (
            <BinaryPicker active={active} onChange={onChange} />
          )}
        </GlassPopoverContent>
      </GlassPopover>
    </div>
  );
}

// ─── Tiered effort slider popover (GLM low→max, DeepSeek high/max) ────────────

export function TieredPicker({
  stops,
  current,
  onChange,
}: {
  stops: ReasoningLevel[];
  current: ReasoningLevel | undefined;
  onChange: (l: ReasoningLevel) => void;
}) {
  const sliderOn = current !== undefined && current !== "off" && stops.includes(current);
  const idx = sliderOn ? stops.indexOf(current) : -1;
  const live = sliderOn ? levelLabel(current as ReasoningLevel) : "Off";
  return (
    <div className="px-4 pt-3 pb-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[11px] font-mono dark:text-[#a3a3a3] light:text-[#525252]">
          Reasoning effort
        </span>
        <span className="text-[11px] font-mono text-[#ffb400]">{live}</span>
      </div>
      <GlassSlider
        ariaLabel="Reasoning effort"
        min={-1}
        max={stops.length - 1}
        step={1}
        value={idx}
        accent="#ffb400"
        onValueChange={(v) => {
          if (v < 0) onChange("off");
          else onChange(stops[v]);
        }}
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

// ─── Binary on/off pair popover (Gemma / Diffusion / MiniMax-M3 / Step) ───────

export function BinaryPicker({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (l: ReasoningLevel) => void;
}) {
  return (
    <div className="min-w-[176px] px-2.5 py-1">
      {(["off", "on"] as ReasoningLevel[]).map((opt) => {
        const sel = (opt === "on" && active) || (opt === "off" && !active);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "flex items-center justify-between w-full rounded-lg px-2.5 py-2 text-[12px] font-mono text-left transition-colors",
              sel
                ? "text-[#ffb400] dark:bg-[#ffb400]/12 light:bg-[#ffb400]/16"
                : "dark:text-[#a3a3a3] light:text-[#525252] hover:dark:bg-white/[0.05] hover:light:bg-black/[0.05]"
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
