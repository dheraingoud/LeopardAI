// Reasoning-effort tier model.
//
// The shape of a model's effort control comes from its PROBED registry entry
// (lib/nim.ts MODEL_REGISTRY) — never from the model's name, family, or
// marketing tier. Three shapes exist upstream:
//
//   none    — the model has no reasoning knob (locked-on or reasoning-off).
//   binary  — a think toggle only: Off / On.
//   discrete— named effort tiers the provider accepts (low … max).
//
// A tier's `id` is the value sent to the provider, so it must be one the
// provider actually accepts. NIM's `reasoning_effort` enum is
// none|minimal|low|medium|high|xhigh|max — "off" is NOT a member and 400s,
// so for effort-param models the off switch is the enum's own "none".
// Boolean-param models (think / enable_thinking) keep "off"/"on" ids, which
// the provider-option builder converts to a boolean.
//
// Tier labels are derived from the tier id, so a provider that publishes its
// own tier names renders them verbatim without a code change.

import type { ReasoningConfig, ReasoningLevel } from "@/lib/nim";

export type EffortTierKind = "none" | "binary" | "discrete";

export type EffortTier = {
  /** The level sent to the provider. */
  id: ReasoningLevel;
  /** Display label ("Low", "XHigh", a provider-defined tier name). */
  label: string;
};

export type EffortTiers = {
  kind: EffortTierKind;
  /** Ordered stops, lowest first. Empty for "none". */
  levels: EffortTier[];
  /** True when the model exposes a real, working off switch. */
  canTurnOff: boolean;
};

/**
 * "low" → "Low", "xhigh" → "XHigh". The two off spellings ("off" for
 * boolean-param models, "none" for NIM's effort enum) both read as "Off";
 * "on" reads as "On". Any other tier name is capitalized per word, so a
 * provider that publishes a new name still renders without a code change.
 */
export function effortLabel(level: string): string {
  if (level === "off" || level === "none") return "Off";
  if (level === "on") return "On";
  if (level === "xhigh") return "XHigh";
  return level
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** The provider id that means "reasoning off", per reasoning param. */
function offId(cfg: ReasoningConfig): ReasoningLevel {
  return cfg.param === "effort" ? "none" : "off";
}

/** The provider id that means "reasoning on", per reasoning param. */
function onId(cfg: ReasoningConfig): ReasoningLevel {
  return cfg.param === "effort" ? "high" : "on";
}

/**
 * The tiers a model actually exposes. The off switch is prepended only when
 * the probe found a working one — models that reason regardless
 * (offSupported: false) must not offer a lying "Off".
 */
export function effortTiers(cfg: ReasoningConfig | undefined): EffortTiers {
  if (!cfg?.enabled || !cfg.toggleable || !cfg.param) {
    return { kind: "none", levels: [], canTurnOff: false };
  }
  const stops = cfg.effortLevels ?? [];
  const off: EffortTier = { id: offId(cfg), label: "Off" };
  if (stops.length === 0) {
    return {
      kind: "binary",
      levels: [off, { id: onId(cfg), label: "On" }],
      canTurnOff: true,
    };
  }
  const canTurnOff = cfg.offSupported !== false;
  const levels = stops.map((id) => ({ id, label: effortLabel(id) }));
  return {
    kind: "discrete",
    levels: canTurnOff ? [off, ...levels] : levels,
    canTurnOff,
  };
}

/** Index of the active tier, or -1 when nothing is selected. */
export function tierIndex(
  tiers: EffortTiers,
  value: ReasoningLevel | undefined,
): number {
  if (!value) return -1;
  return tiers.levels.findIndex((t) => t.id === value);
}

/** The tier a model starts on when the user has not chosen one. */
export function defaultTier(
  tiers: EffortTiers,
  cfg: ReasoningConfig | undefined,
): EffortTier | undefined {
  if (tiers.kind === "none") return undefined;
  const wanted = cfg?.defaultEffort;
  const found = wanted ? tiers.levels.find((t) => t.id === wanted) : undefined;
  if (found) return found;
  return tiers.levels[tiers.canTurnOff ? 1 : 0] ?? tiers.levels[0];
}

/**
 * The tier id a requested level maps to on this model, or undefined when the
 * model does not expose it. The two off/on spellings are normalized to the
 * model's own tier ids: a value persisted before the effort-param models
 * moved to NIM's "none" enum still reads as "off", and that must reach the
 * provider as "none" — NIM rejects "off" with HTTP 400.
 */
export function normalizeLevel(
  cfg: ReasoningConfig | undefined,
  requested: ReasoningLevel | undefined,
): ReasoningLevel | undefined {
  const tiers = effortTiers(cfg);
  if (tiers.kind === "none" || !cfg || !requested) return undefined;
  if (tiers.levels.some((t) => t.id === requested)) return requested;
  if (requested === "off" || requested === "none") {
    const off = tiers.levels.find((t) => t.id === offId(cfg));
    if (off) return off.id;
  }
  if (requested === "on") {
    const on = tiers.levels.find((t) => t.id === onId(cfg));
    if (on) return on.id;
  }
  return undefined;
}

/**
 * The level to send for a given model. A level the model does not expose is
 * dropped in favour of that model's default, so a switch to a model with a
 * different tier set never sends an unusable value upstream.
 */
export function resolveLevelFor(
  cfg: ReasoningConfig | undefined,
  requested: ReasoningLevel | undefined,
): ReasoningLevel | undefined {
  const tiers = effortTiers(cfg);
  if (tiers.kind === "none" || !cfg) return undefined;
  return normalizeLevel(cfg, requested) ?? defaultTier(tiers, cfg)?.id;
}
