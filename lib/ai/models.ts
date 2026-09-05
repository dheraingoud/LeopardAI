/**
 * Unified model registry — single source of truth.
 *
 * Consumed by /api/models + /api/chat/route.ts + the client model selector +
 * the reasoning control. lib/nim.ts keeps the capability seed (MODEL_REGISTRY)
 * + the legacy SSE utils (buildNIMPayload/callNIM); this file is the live
 * registry surface every consumer reads.
 *
 * Two providers, env-driven:
 *   NIM      — NVIDIA NIM direct (lib/nim.ts engine). Env: NVIDIA_API_KEY.
 *   gateway  — Vercel AI Gateway. Env: AI_GATEWAY_API_KEY.
 *
 * Curated build (2026-07-09): GATEWAY_SEED is EMPTY — the prior 5 gateway ids
 * (deepseek-v3.2 / kimi-k2.5 / gpt-oss-20b / gpt-oss-120b / grok-4.1-fast) were
 * all dead/unavailable and none are in the user's goal list. NIM carries the
 * full goal set (9 chat reasoners/VLMs from MODEL_REGISTRY). The image + video
 * gen seeds are ALSO empty this increment — the NIM genai endpoint is
 * unconfirmed (prior probes 404'd), so no image/video ids ship until Phase 10
 * confirms the endpoint + the live ids. An image entry that 404s when selected
 * is worse than none. Env gating (NIM_IMAGE_MODELS / NIM_VIDEO_MODELS /
 * GATEWAY_MODELS) stays wired; re-seed with live ids when ready.
 *
 * Env vars (all optional):
 *   NIM_DEFAULT_MODEL       override default chat model id (NIM)
 *   NIM_UTILITY_MODEL       override title/utility model id (NIM)
 *   NIM_MODELS              CSV of NIM ids to expose (default: all in MODEL_REGISTRY)
 *   NIM_IMAGE_MODELS        CSV of NIM image-gen ids (default: empty — dormant)
 *   NIM_VIDEO_MODELS        CSV of NIM video-gen ids (default: empty — dormant)
 *   GATEWAY_DEFAULT_MODEL   override default chat model id (gateway)
 *   GATEWAY_MODELS          CSV of gateway ids (default: empty — dormant)
 *   AI_GATEWAY_API_KEY      gateway auth (server-side)
 *
 * Reasoning routing — nimReasoningProviderOptions(model, level) builds the
 * openai-compatible `nim` providerOptions block. openai-compatible@3 reads
 * `providerOptions.nim.reasoningEffort` (camel) and AUTO-MAPS it to body-root
 * `reasoning_effort` (snake); extra non-spec keys (chat_template_kwargs) pass
 * through literally snake_case. So:
 *   param:"effort" → { nim: { reasoningEffort } }   (deepseek/glm + binary gemma/step)
 *   param:"think"  → { nim: { chat_template_kwargs: { think } } }   (gemma/diffusion)
 *   param absent   → {} (locked-on Cosmos reasoner — reasons by architecture)
 * Consumed by route.ts only.
 *
 * Server-only-call: getCapabilities() (NIM entries are pure; gateway fetch is a
 * no-op while GATEWAY_SEED is empty). Safe on client: getActiveModels/
 * getModelById/getDefaultChatModel/getUtilityModel/IMAGE_ASPECT_RATIO_SIZES/
 * nimReasoningProviderOptions (pure; env reads are undefined client-side →
 *returns all curated seeds, which is why the selector fetches /api/models).
 */

import {
  MODEL_REGISTRY,
  NIM_BASE,
  DEFAULT_MODEL,
  UTILITY_MODEL,
  type ModelCapability,
  type ReasoningConfig,
  type ReasoningLevel,
} from "@/lib/nim";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Provider = "nim" | "gateway";
export type SpeedTier = "fast" | "balanced" | "slow";
export type ModelKind = "text" | "image" | "video";

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  /** reasoning-capable (=== reasoningConfig.enabled) — gates sendReasoning. */
  reasoning: boolean;
  /** Hard-coded from the build.nvidia cards (NIM /v1/models exposes no metadata). */
  contextWindow: number;
  /** Full reasoning shape — drives the input-bar reasoning control. */
  reasoningConfig: ReasoningConfig;
};

export type ChatModel = {
  id: string;
  name: string;
  provider: Provider;
  description: string;
  speedTier: SpeedTier;
  supportsVision: boolean;
  /** === reasoningConfig.enabled (selector Brain icon). */
  supportsReasoning: boolean;
  supportsTools: boolean;
  /** Hard-coded per model. qwen-image-edit accepts an image attachment and
   *  edits it from the prompt. Other image models ignore attachments. */
  supportsImageEdit?: boolean;
  /** From MODEL_REGISTRY, hard-coded per card. */
  contextWindow: number;
  /** Per-model reasoning shape — drives the reasoning control + the route. */
  reasoningConfig: ReasoningConfig;
  kind: ModelKind;
  /** TRUE = upstream down/hanging — selector greys out, selection blocked. */
  unavailable?: boolean;
  /** Why unavailable (selector tooltip). */
  unavailableReason?: string;
  /** Gateway provider order hint — unused NIM (undefined). */
  gatewayOrder?: string[];
};

// ─── Re-exports (one source) ──────────────────────────────────────────────────

export { NIM_BASE, DEFAULT_MODEL, UTILITY_MODEL };
export type { ModelCapability, ReasoningConfig, ReasoningLevel };

// ─── NIM seed (text models straight from MODEL_REGISTRY) ──────────────────────

const speedTierMap: Record<ModelCapability["speedTier"], SpeedTier> = {
  1: "fast",
  1.5: "balanced",
  3: "slow",
};

// Cap the effective context window fed to the model + shown on the context
// indicator. The registry declares each model's TRUE window; the cap bounds
// prompt cost/size; the cap bounds prompt cost/size. All text models → 256k;
// the compact muse line → 128k. Gen models (declared 0) keep 0 = "unknown".
const CONTEXT_CAP_DEFAULT = 256_000;
const CONTEXT_CAP_MUSE = 128_000;
function effectiveContextWindow(id: string, declared: number): number {
  if (!declared || declared <= 0) return declared;
  return Math.min(declared, id.includes("muse") ? CONTEXT_CAP_MUSE : CONTEXT_CAP_DEFAULT);
}

/** Chat models are read straight from nim.ts MODEL_REGISTRY — contextWindow +
 * reasoningConfig come from the curated per-model cards there. contextWindow is
 * run through effectiveContextWindow() so every consumer (selector, /api/models,
 * capability check, context indicator) shares the CAP, not the raw registry value. */
function nimTextSeed(): ChatModel[] {
  return Object.values(MODEL_REGISTRY).map((m) => ({
    id: m.id,
    name: m.displayName,
    provider: "nim" as const,
    description:
      m.type === "vlm"
        ? `${m.displayName} — vision`
        : `${m.displayName} — ${speedTierMap[m.speedTier]}`,
    speedTier: speedTierMap[m.speedTier],
    supportsVision: m.supportsVision,
    supportsReasoning: m.reasoning.enabled,
    // Per-model supportsTools from MODEL_REGISTRY (verified live via curl probe
    // 2026-07-06). The route advertises tools whenever ENABLE_ARTIFACTS=1
    // regardless; this drives the selector Wrench icon + getCapabilities
    // fallback, so it's accurate per model rather than a blanket false.
    supportsTools: m.supportsTools ?? false,
    contextWindow: effectiveContextWindow(m.id, m.contextWindow),
    reasoningConfig: m.reasoning,
    kind: "text",
    unavailable: m.unavailable,
    unavailableReason: m.unavailableReason,
  }));
}

// ─── Gateway seed (EMPTY — dead ids removed) ───────────────────────────────────
// The 5 prior gateway ids were all dead/unavailable + not in the user's goal
// list. Env GATEWAY_MODELS remains wired (filterByEnv + getDefaultChatModel gw
// path) for future re-seeding; with an empty seed there's nothing to expose.
const GATEWAY_SEED: ChatModel[] = [];

// Φ9 qwen-image + qwen-image-edit. Hit NIM's native /infer namespace
// (POST /v1/qwen/<model>/infer, body {prompt, seed, image_size | image},
// response {artifacts:[{base64}]}). UNAVAILABLE 2026-07-11: both ids return
// "qwen-infer 404" from NIM — the /v1/qwen/<model>/infer endpoint does not
// resolve. Commented out until NIM surfaces them.
const NIM_IMAGE_SEED: ChatModel[] = [
  // {
  //   id: "qwen/qwen-image",
  //   name: "Qwen Image",
  //   provider: "nim",
  //   description: "Qwen Image — text→image",
  //   speedTier: "balanced",
  //   supportsVision: false,
  //   supportsReasoning: false,
  //   supportsTools: false,
  //   supportsImageEdit: false,
  //   contextWindow: 0,
  //   reasoningConfig: { enabled: false, toggleable: false, defaultEffort: "off" },
  //   kind: "image",
  // },
  // {
  //   id: "qwen/qwen-image-edit",
  //   name: "Qwen Image Edit",
  //   provider: "nim",
  //   description: "Qwen Image Edit — image+prompt→image",
  //   speedTier: "balanced",
  //   supportsVision: false,
  //   supportsReasoning: false,
  //   supportsTools: false,
  //   supportsImageEdit: true,
  //   contextWindow: 0,
  //   reasoningConfig: { enabled: false, toggleable: false, defaultEffort: "off" },
  //   kind: "image",
  // },
];
const NIM_VIDEO_SEED: ChatModel[] = [];

// ─── Env filtering ────────────────────────────────────────────────────────────

/** Returns the models whose id is in the CSV env var, or all `models` if unset. */
function filterByEnv(models: ChatModel[], envVar: string): ChatModel[] {
  const csv = process.env[envVar];
  if (!csv) return models;
  const ids = new Set(
    csv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return models.filter((m) => ids.has(m.id));
}

// ─── Resolved registry (lazily cached per-process) ────────────────────────────

let _active: ChatModel[] | null = null;

export function getActiveModels(): ChatModel[] {
  if (_active) return _active;
  _active = [
    ...filterByEnv(nimTextSeed(), "NIM_MODELS"),
    ...filterByEnv(GATEWAY_SEED, "GATEWAY_MODELS"),
    ...filterByEnv(NIM_IMAGE_SEED, "NIM_IMAGE_MODELS"),
    ...filterByEnv(NIM_VIDEO_SEED, "NIM_VIDEO_MODELS"),
  ];
  return _active;
}

export function getModelById(id: string): ChatModel | undefined {
  return getActiveModels().find((m) => m.id === id);
}

export function getDefaultChatModel(): ChatModel {
  const models = getActiveModels();
  const nimDefault =
    process.env.NIM_DEFAULT_MODEL &&
    models.find((m) => m.id === process.env.NIM_DEFAULT_MODEL);
  if (nimDefault) return nimDefault;
  const gwDefault =
    process.env.GATEWAY_DEFAULT_MODEL &&
    models.find((m) => m.id === process.env.GATEWAY_DEFAULT_MODEL);
  if (gwDefault) return gwDefault;
  const fromLib = models.find((m) => m.id === DEFAULT_MODEL);
  return fromLib ?? models[0];
}

export function getUtilityModel(): ChatModel {
  const models = getActiveModels();
  const env =
    process.env.NIM_UTILITY_MODEL &&
    models.find((m) => m.id === process.env.NIM_UTILITY_MODEL);
  if (env) return env;
  const fromLib = models.find((m) => m.id === UTILITY_MODEL);
  return fromLib ?? getDefaultChatModel();
}

export function isImageModel(id: string): boolean {
  return getModelById(id)?.kind === "image";
}

export function isVideoModel(id: string): boolean {
  return getModelById(id)?.kind === "video";
}

export function isGenerationModel(id: string): boolean {
  const m = getModelById(id);
  return m?.kind === "image" || m?.kind === "video";
}

// ─── Derived maps (consumer helpers) ──────────────────────────────────────────

export const allowedModelIds: Set<string> = new Set(
  getActiveModels().map((m) => m.id),
);

export const modelsByProvider = getActiveModels().reduce(
  (acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  },
  {} as Record<Provider, ChatModel[]>,
);

export const isDemo = process.env.IS_DEMO === "1";

// ─── Image aspect-ratio sizes ─────────────────────────────────────────────────

export type ImageAspectRatio =
  | "1:1"
  | "16:9"
  | "9:16"
  | "3:2"
  | "2:3"
  | "5:4"
  | "4:5";

export const IMAGE_ASPECT_RATIO_SIZES: Record<
  ImageAspectRatio,
  { width: number; height: number }
> = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1344, height: 768 },
  "9:16": { width: 768, height: 1344 },
  "3:2": { width: 1216, height: 832 },
  "2:3": { width: 832, height: 1216 },
  "5:4": { width: 1152, height: 896 },
  "4:5": { width: 896, height: 1152 },
};

export function normalizeImageAspectRatio(input: unknown): ImageAspectRatio {
  if (typeof input !== "string") return "1:1";
  const ratio = input.trim() as ImageAspectRatio;
  if (ratio in IMAGE_ASPECT_RATIO_SIZES) return ratio;
  return "1:1";
}

/** Resolve image dims for a ratio. The SDXL square-clamp was dropped (no SDXL
 * in the curated build). Honors the requested ratio; falls back to 1:1. */
export function resolveImageDimensions(
  aspectRatio: ImageAspectRatio,
): { width: number; height: number } {
  return (
    IMAGE_ASPECT_RATIO_SIZES[aspectRatio] ?? IMAGE_ASPECT_RATIO_SIZES["1:1"]
  );
}

// ─── Reasoning → NIM providerOptions (route-only) ─────────────────────────────

/**
 * Build the openai-compatible `nim` providerOptions block for a chosen reasoning
 * level on a NIM chat model. openai-compatible@3 reads `providerOptions.nim.*`;
 * `reasoningEffort` (camel) is AUTO-MAPPED to body-root `reasoning_effort`
 * (snake) at chat-language-model.ts line ~600; extra non-spec keys
 * (`chat_template_kwargs`) pass through literally snake_case.
 *
 *   param:"effort"          → { nim: { reasoningEffort } }. OFF (or a binary
 *                             effort model's "off") omits the key → NIM
 *                             non-think mode. Binary on/off effort models
 *                             (deepseek-flash / step) map ON → "high".
 *   param:"think"           → { nim: { chat_template_kwargs: { think } } }
 *                             (literal pass-through) — diffusiongemma.
 *   param:"enable_thinking" → { nim: { chat_template_kwargs:
 *                                   { enable_thinking: bool } } } (literal
 *                             pass-through) — empirically the only param
 *                             that makes glm-5.2 / deepseek-pro
 *                             / gemma-4 surface `reasoning_content` at NIM
 *                             (probed 2026-07-11). reasoning_effort is
 *                             accepted (HTTP 200) but NIM emits
 *                             reasoning_content:null. Bin: "off"→false,
 *                             anything else→true.
 *   param absent           → {} — locked-on reasoner (cosmos) — no knob;
 *                             route sends no reasoning providerOptions.
 *
 * Non-NIM or reasoning-disabled models also return {}. The route spreads this
 * into streamText's `providerOptions` — an empty object is a no-op. NB: this
 * returns the NESTED `{ nim: {...} }` form because the SDK reads
 * `providerOptions.nim`, not a top-level key.
 */
export function nimReasoningProviderOptions(
  model: ChatModel | undefined,
  level: ReasoningLevel | undefined,
): Record<string, unknown> {
  if (!model || model.provider !== "nim") return {};
  const cfg = model.reasoningConfig;
  if (!cfg?.param) return {};
  if (cfg.param === "think") {
    return { nim: { chat_template_kwargs: { think: level !== "off" } } };
  }
  if (cfg.param === "enable_thinking") {
    return {
      nim: { chat_template_kwargs: { enable_thinking: level !== "off" } },
    };
  }
  // "effort"
  // OFF must be EXPLICIT: omitting the param leaves the model at its upstream
  // default, and nemotron-3.5-lightning defaults to thinking ON (live probe
  // 2026-09-05: reasoning_content populated with no params). NIM accepts
  // chat_template_kwargs.enable_thinking:false to disable cleanly.
  if (!level) return {};
  if (level === "off") {
    return { nim: { chat_template_kwargs: { enable_thinking: false } } };
  }
  const effort = level === "on" ? "high" : level; // binary effort model ON → "high"
  return { nim: { reasoningEffort: effort } };
}

// ─── Capabilities (server-only fetch when gateway re-seeded; no-op now) ───────

/**
 * Per-model capabilities. With gateway seeded empty, this returns NIM entries
 * straight from the registry seed (NIM /v1/models exposes no metadata, so
 * contextWindow + reasoningConfig are hard-coded from the build.nvidia cards).
 * When gateway models are re-seeded, restore the per-model fetch against
 * ai-gateway.vercel.sh/v1/models/<id>/endpoints for tools/vision/reasoning flags
 * and synthesize a reasoningConfig there.
 */
export async function getCapabilities(): Promise<
  Record<string, ModelCapabilities>
> {
  const nimModels = getActiveModels().filter((m) => m.provider === "nim");
  return Object.fromEntries(
    nimModels.map((m) => [
      m.id,
      {
        tools: m.supportsTools,
        vision: m.supportsVision,
        reasoning: m.supportsReasoning,
        contextWindow: m.contextWindow,
        reasoningConfig: m.reasoningConfig,
      },
    ]),
  );
}
