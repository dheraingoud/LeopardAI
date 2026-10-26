/**
 * NVIDIA NIM API core library.
 *
 * Goal-driven curation (2026-08-24): the chat registry exposes ONLY the live,
 * curated set mapped from the NIM /v1/models endpoint —
 *   minimaxai/minimax-m3.1-flash (DEFAULT), stepfun-ai/step-5-preview,
 *   nvidia/nemotron-3.5-lightning-30b-a3b, nvidia/nemotron-3.5-super-vl-120b-a12b,
 *   google/diffusiongemma-26b-a4b-it, meta/muse-glimmer-30b,
 *   poolside-laguna-xs-2.1, google/gemma-4-31b-it,
 *   deepseek-ai/deepseek-v4.1-flash, z-ai/glm-5.3-flash.
 * inkling + step-3.7-flash removed 2026-08-31 (broken routing / NIM 404).
 * glm-5.2 removed 2026-08-24 (deprecated — no longer in /v1/models).
 * kimi-k3 + glm-5.3 removed 2026-10-15 (operator: retire from picker).
 * minimax-m3 removed 2026-08-31 (operator: minimax deprecating; was also
 *   returning 0-token "stop" responses with 50-85s latency) — minimax-m3.1-flash
 *   re-added 2026-10-26 after a live probe (tools + vision + 262,144 ctx).
 * All ids verified present in /v1/models (2026-08-24 probe: 102 models).
 * deepseek-v4-pro is NOT
 * in the catalogue and was dropped. diffusiongemma is a TEXT-OUT VLM (takes
 * image/video, emits text via discrete diffusion) — it is NOT image-gen; no
 * true image-gen model is confirmed in /v1/models, so image gen stays dormant.
 * Each entry hard-codes contextWindow (NIM /v1/models exposes NO metadata) and
 * a reasoning config that drives the input bar's reasoning setter (on/off
 * dropdown + an effort slider for models that publish effort tiers). The
 * reasoning config is the ONLY source of reasoning-effort metadata — /v1/models
 * lists ids only, so effort tiers are curated per card (their values shape the
 * slider stops).
 *
 * Reasoning routing — which body param each model honors (top-level
 * `reasoning_effort` vs `chat_template_kwargs.think`) — lives in
 * app/api/chat/route.ts; this file only seeds the UI + the capability map.
 *
 * Exports:
 *   NIM_BASE, UTILITY_MODEL, DEFAULT_MODEL
 *   ModelCapability, ReasoningConfig, ReasoningLevel, MODEL_REGISTRY
 *   buildNIMPayload(), NIMError      (legacy pre-AI-SDK-v6 SSE path; no live
 *   callNIM, streamWithRetry          callers post-Phase-4 — kept for reference)
 *
 * The live streaming path is AI SDK v6 (`streamText` + the openai-compatible
 * `nim` provider in lib/ai/providers.ts); this file owns only the capability
 * seed (consumed by lib/ai/models.ts) + the URL + the legacy (dead) SSE utils.
 */

// ─── ModelCapability interface ───────────────────────────────────────────────

/**
 * Discrete reasoning levels exposed to the input bar's dropdown/slider.
 * "off" = reasoning disabled; "on" = enabled at the model's default; the rest
 * are explicit effort tiers some models publish (deepseek Think High/Max, GLM
 * thinking-effort levels). The body-param mapping (reasoning_effort:"high" vs
 * chat_template_kwargs.think:true) is per-model in app/api/chat/route.ts; the
 * registry just declares which stops the UI renders.
 */
export type ReasoningLevel = "off" | "on" | "low" | "medium" | "high" | "max";

export interface ReasoningConfig {
  /** TRUE for reasoning-capable models (all curated chat models are). */
  enabled: boolean;
  /** FALSE = locked-on reasoner (cosmos reasoners) — the bar hides the OFF state. */
  toggleable: boolean;
  /**
   * Which NIM body param honors reasoning — drives route.ts's
   * nimReasoningProviderOptions():
   *
   *   "effort"          → { nim: { reasoningEffort: level } }. OFF (or a binary
   *                        effort model's "off") omits the key → NIM non-think
   *                        mode. Binary on/off effort models (gemma/step)
   *                        map ON → "high".
   *   "think"           → { nim: { chat_template_kwargs: { think: bool } } }
   *                        (literal pass-through).
   *   "enable_thinking" → { nim: { chat_template_kwargs:
   *                                { enable_thinking: bool } } } (literal
   *                        pass-through). Used by NIM for GLM-5.2
   *                        / deepseek-v4-pro / gemma-4 — empirical probe
   *                        2026-07-11: with reasoning_effort these models
   *                        accept the param (HTTP 200) but NIM emits
   *                        reasoning_content:null on every chunk → reasoning
   *                        card never mounts. enable_thinking makes NIM
   *                        actually populate reasoning_content.
   *   Absent           → locked-on reasoner (cosmos by default; diffusiongemma
   *                        flags it locked-on but the chat_template_kwargs
   *                        +reasoning content never surfaces in the protocol
   *                        either, so the card stays empty).
   *
   * Consumed by app/api/chat/route.ts only.
   */
  param?: "effort" | "think" | "enable_thinking";
  /**
   * Effort tiers selectable when reasoning is ON. Absent ⇒ pure on/off toggle
   * (gemma / diffusion / step expose only a think toggle). Present ⇒
   * the bar renders an effort slider the user drags between these stops.
   */
  effortLevels?: ReasoningLevel[];
  /** What the bar initializes the selector to — "off" or a default effort tier. */
  defaultEffort: ReasoningLevel;
  /**
   * FALSE = the model has no working "off" upstream (probed: NIM ignores
   * enable_thinking:false / think:false / low on these models — they reason
   * regardless). The picker then floors the slider at the lowest real tier
   * instead of offering a lying "Off". Default true.
   */
  offSupported?: boolean;
}

export interface ModelCapability {
  id: string;
  displayName: string;
  speedTier: 1 | 1.5 | 3;
  type: "llm" | "vlm";
  supportsVision: boolean;
  /**
   * Which vision modalities the model accepts — gates the PlusMenu media
   * picker's accept list + the "needs VLM" / "no video" hints. Current VLMs
   * (gemma-4, diffusiongemma) take image+video.
   */
  visionModalities?: ("image" | "video")[];
  // NIM tool-calling: the M-series / GLM / DeepSeek / Gemma / Step families all
  // emit proper OpenAI tool_calls; /api/chat advertises tools whenever
  // ENABLE_ARTIFACTS=1. Drives the selector Wrench icon + getCapabilities fallback.
  supportsTools?: boolean;
  /** Hard-coded from the build.nvidia model cards (NIM /v1/models exposes none). */
  contextWindow: number;
  reasoning: ReasoningConfig;
  // Legacy kimi-disable knobs (chat_template_kwargs / include_reasoning). None
  // of the curated models use these — kept on the type for buildNIMPayload parity.
  disableParam?: Record<string, unknown>;
  hideReasoningParam?: Record<string, unknown>;
  /** TRUE = upstream is down/hanging (NIM returns empty or 5xx for every
   * request) — the selector greys it out and blocks selection while keeping it
   * visible for transparency. Re-checked live; flip back when NIM recovers. */
  unavailable?: boolean;
  /** Why the model is flagged unavailable (tooltip). */
  unavailableReason?: string;
}

// ─── Base URL and model defaults ────────────────────────────────────────────

export const NIM_BASE = "https://integrate.api.nvidia.com/v1";

// Utility = title-gen/small-job model. Fast, used
// for server-side title generation (low stakes — no reasoning sent for titles).
export const UTILITY_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b"; // title-gen + subagents. muse-glimmer HANGS upstream (no-tools generateText never returns, 45s+; probed 2026-09-01) despite still being listed in /v1/models — back to nemotron-lightning.

// Default chat model. History of the default:
//   z-ai/glm-5.2 (stalled upstream, then pulled from the NIM catalogue 2026-08-24)
//   → step-3.7-flash (interim, since removed) → deepseek-v4-flash-0731 (defaulted 2026-08-20,
//     then HUNG both thinking + non-thinking 2026-08-24 — empty body in 45s).
// Defaulted moonshotai/kimi-k3 2026-08-24; briefly switched to
// google/diffusiongemma-26b-a4b-it 2026-08-30 over kimi's mid-stream gaps,
// operator reverted to kimi 2026-08-31 — post-chunk stall budget now 180s
// with reasoning on, which covers the gaps. diffusiongemma stays in picker.
// 2026-08-31 (later): kimi-k3 went fully unresponsive upstream (0 bytes in
// 60s on a 16-token probe, thinking on or off; 141s silent first attempt in
// app → retry → 3.6min turns). gemma-4 + deepseek-flash hang the same way.
// Live fast models probed: nemotron-3.5-lightning (0.7s), laguna, muse,
// diffusiongemma. Default → nemotron-3.5-lightning until kimi recovers.
// 2026-09-02: kimi briefly re-defaulted (plain replies fast) but HANGS on
// tool-use turns (300s, spawn_agents never fires) → default back to
// nemotron-3.5-lightning; orchestration green again (live-notes PASS).
// 2026-10-26 (operator): default → minimaxai/minimax-m3.1-flash. Probed live:
// tools YES (finish_reason tool_calls, well-formed args), vision YES (reads a
// 128x128 PNG and answers "Red"), 262,144-token context, reasoning_effort
// modulates reasoning length but reasoning_content is never empty.
export const DEFAULT_MODEL = "minimaxai/minimax-m3.1-flash";

// ─── MODEL_REGISTRY (curated: text LLMs/VLMs mapped from /v1/models) ──────────
// contextWindow + vision modality + reasoning config hard-coded from the
// build.nvidia model cards (NIM /v1/models exposes no metadata). All ids below
// verified present in /v1/models 2026-08-17.
// glm-5.2 + deepseek-v4-flash-0731 are text-only; gemma-4 / step-3.7 /
// diffusiongemma accept image/video (vision). The 4 additions (muse-glimmer /
// thinkingmachines-inkling / poolside-laguna-xs-2.1 / nemotron-3.5-lightning)
// are lean-in-setting reasoners — binary effort toggle (param:"effort") until
// their /chat/completions reasoning_content probes seed real tiers.
//
// minimax-m3 REMOVED 2026-08-31 (operator: minimax deprecating; was returning
// 0-token "stop" responses at 50-85s latency — pure latency burn).

export const MODEL_REGISTRY: Record<string, ModelCapability> = {
  // GLM 5.2 removed 2026-08-24 — deprecated + pulled from the NIM /v1/models
  // catalogue (probe returns zero glm ids). Do not re-add.
  // moonshotai/kimi-k3 REMOVED 2026-10-15 (operator: retire from picker).
  // minimax-m3.1-flash added 2026-10-26 (operator). Live probe: present in
  // /v1/models, tools YES (finish_reason tool_calls, well-formed args),
  // vision YES (reads a 128x128 PNG and answers "Red"), context window
  // 262,144 (bisected against the upstream "Invalid request" ceiling).
  // reasoning_effort modulates reasoning length (low≈570 / high≈800 /
  // max≈820 chars on a 3-field sheep problem) but reasoning_content is never
  // empty — there is no off, so offSupported:false floors the slider at "low".
  "minimaxai/minimax-m3.1-flash": {
    id: "minimaxai/minimax-m3.1-flash",
    displayName: "Minimax M3.1 Flash",
    speedTier: 1,
    type: "vlm",
    supportsVision: true,
    visionModalities: ["image"],
    supportsTools: true,
    contextWindow: 262_144,
    reasoning: {
      enabled: true,
      toggleable: true,
      param: "effort",
      effortLevels: ["low", "high", "max"],
      defaultEffort: "low",
      offSupported: false,
    },
  },
  // nvidia/nemotron-3.5-super-vl-120b-a12b added 2026-10-26 (operator). Live
  // probe: present in /v1/models, tools YES, vision YES (reads a 128x128 PNG
  // and answers "Red"), context window 1,000,000 (upstream error states the
  // ceiling). reasoning_effort modulates reasoning length (low≈1680 /
  // high≈1970 / max≈1420 chars) but reasoning_content is never empty — no off,
  // so offSupported:false floors the slider at "low".
  "nvidia/nemotron-3.5-super-vl-120b-a12b": {
    id: "nvidia/nemotron-3.5-super-vl-120b-a12b",
    displayName: "Nemotron 3.5 Super VL 120B",
    speedTier: 1,
    type: "vlm",
    supportsVision: true,
    visionModalities: ["image"],
    supportsTools: true,
    contextWindow: 1_000_000,
    reasoning: {
      enabled: true,
      toggleable: true,
      param: "effort",
      effortLevels: ["low", "high", "max"],
      defaultEffort: "low",
      offSupported: false,
    },
  },
  "google/gemma-4-31b-it": {
    id: "google/gemma-4-31b-it",
    displayName: "Gemma 4 31B",
    speedTier: 1.5,
    type: "vlm",
    supportsVision: true,
    visionModalities: ["image", "video"],
    supportsTools: true,
    contextWindow: 262_144,
    // Card says thinking via `<|think|>` / `chat_template_kwargs.think`.
    // NIM probe 2026-07-11: `chat_template_kwargs:{think:true}` →
    // `reasoning_content:null` on every chunk. `{enable_thinking:true}`
    // yields 9 non-null reasoning chunks (out of 12 raw) — adopt `enable_thinking`.
    reasoning: { enabled: true, toggleable: true, param: "enable_thinking", defaultEffort: "on" },
  },
  // deepseek-v4-flash-0731 + deepseek-v4-pro-0813 REMOVED 2026-10-05 (operator:
  // replace with v4.1-flash). v4.1-flash verified present in /v1/models.
  "deepseek-ai/deepseek-v4.1-flash": {
    id: "deepseek-ai/deepseek-v4.1-flash",
    displayName: "DeepSeek V4.1 Flash",
    speedTier: 1,
    type: "llm",
    supportsVision: false,
    supportsTools: true,
    contextWindow: 1_000_000,
    // Carries the V4 reasoning routing (top-level reasoning_effort); NIM card
    // for v4.1-flash publishes effort tiers. Inference-probe once the key is
    // back to confirm the exact accepted levels (v4 accepted high/max only).
    reasoning: {
      enabled: true,
      toggleable: true,
      param: "effort",
      effortLevels: ["high", "max"],
      defaultEffort: "high",
    },
  },
  // stepfun-ai/step-5-preview added 2026-10-15 (operator). Probed live:
  // tools YES (finish_reason tool_calls, well-formed args), vision NO (image
  // input → 400, text-only), reasoning YES — chat_template_kwargs
  // enable_thinking:false cleanly empties reasoning_content, and
  // reasoning_effort accepts low/high/max (low→0 chars, high→358, max→182).
  "stepfun-ai/step-5-preview": {
    id: "stepfun-ai/step-5-preview",
    displayName: "Step 5 Preview",
    speedTier: 1,
    type: "llm",
    supportsVision: false,
    supportsTools: true,
    contextWindow: 262_144,
    reasoning: {
      enabled: true,
      toggleable: true,
      param: "effort",
      effortLevels: ["low", "high", "max"],
      defaultEffort: "low",
    },
  },
  // GLM 5.3 family added 2026-10-05 (operator). Both verified in /v1/models.
  // GLM 5.3 family (added 2026-10-05). Probe 2026-10-08: enable_thinking:false
  // is IGNORED upstream (reasoning_content arrives regardless) — but
  // reasoning_effort works: low→0-900 chars, high→~11, max→~209. So the knob
  // is real effort tiers with NO off (offSupported:false floors at "low").
  // z-ai/glm-5.3 REMOVED 2026-10-15 (operator: retire from picker).
  "z-ai/glm-5.3-flash": {
    id: "z-ai/glm-5.3-flash",
    displayName: "GLM 5.3 Flash",
    speedTier: 1,
    type: "llm",
    supportsVision: false,
    supportsTools: true,
    contextWindow: 1_000_000,
    reasoning: {
      enabled: true,
      toggleable: true,
      param: "effort",
      effortLevels: ["low", "high", "max"],
      defaultEffort: "low",
      offSupported: false,
    },
  },
  // ─── Additions mapped from /v1/models (2026-08-17) ──────────────────────────
  // "muse glimmer", "thinkingmachines inkling", "poolside laguna", "nemotron
  // 3.5 lightning". Lean-in reasoners — binary effort toggle until a probe
  // seeds real effort tiers.
  "meta/muse-glimmer-30b": {
    id: "meta/muse-glimmer-30b",
    displayName: "Muse Glimmer 30B",
    speedTier: 1,
    type: "llm",
    supportsVision: false,
    supportsTools: true,
    contextWindow: 262_144,
    // Reasoning probe 2026-10-08: muse reasons at EVERY level (low≈200,
    // high≈458, max≈390 chars on a trivial prompt) and ignores off — thinking
    // is architectural (like cosmos). Effort tiers kept (they modulate length
    // some) but no off: offSupported:false floors the slider at "low".
    reasoning: {
      enabled: true,
      toggleable: true,
      param: "effort",
      effortLevels: ["low", "high", "max"],
      defaultEffort: "low",
      offSupported: false,
    },
  },
  // thinkingmachines/inkling REMOVED 2026-08-31 (operator: broken routing).
  "poolside/laguna-xs-2.1": {
    id: "poolside/laguna-xs-2.1",
    displayName: "Laguna XS 2.1",
    speedTier: 1.5,
    type: "llm",
    supportsVision: false,
    supportsTools: true,
    contextWindow: 262_144,
    reasoning: {
      enabled: true,
      toggleable: true,
      param: "effort",
      defaultEffort: "on",
    },
  },
  "nvidia/nemotron-3.5-lightning-30b-a3b": {
    id: "nvidia/nemotron-3.5-lightning-30b-a3b",
    displayName: "Nemotron 3.5 Lightning 30B",
    speedTier: 1,
    type: "llm",
    supportsVision: false,
    supportsTools: true,
    contextWindow: 262_144,
    reasoning: {
      enabled: true,
      toggleable: true,
      param: "effort",
      defaultEffort: "on",
    },
  },
  // stepfun-ai/step-3.7-flash REMOVED 2026-08-31 (operator: broken — NIM 404).
  "google/diffusiongemma-26b-a4b-it": {
    id: "google/diffusiongemma-26b-a4b-it",
    displayName: "DiffusionGemma 26B",
    speedTier: 1.5,
    type: "vlm",
    supportsVision: true,
    visionModalities: ["image", "video"],
    supportsTools: true,
    contextWindow: 262_144,
    // Text-OUT vision model (NOT image gen — takes image/video, emits text via
    // discrete diffusion). Uses chat_template_kwargs:{enable_thinking} —
    // verified 2026-07-11 that <|think|> + chat_template_kwargs:{think} never
    // surfaces reasoning_content; enable_thinking matches the working pattern
    // for all other NIM reasoning models.
    reasoning: { enabled: true, toggleable: true, param: "enable_thinking", defaultEffort: "on" },
  },
  // ─── Cosmos models (UNAVAILABLE 2026-07-11: "Not Found" from NIM) ──────────
  // "nvidia/cosmos-reason2-8b": {
  //   id: "nvidia/cosmos-reason2-8b",
  //   displayName: "Cosmos Reason2 8B",
  //   speedTier: 1.5,
  //   type: "vlm",
  //   supportsVision: true,
  //   visionModalities: ["image", "video"],
  //   supportsTools: false,
  //   contextWindow: 262_144,
  //   reasoning: { enabled: true, toggleable: false, defaultEffort: "on" },
  // },
  // "nvidia/cosmos3-nano-reasoner": {
  //   id: "nvidia/cosmos3-nano-reasoner",
  //   displayName: "Cosmos3 Nano Reasoner",
  //   speedTier: 1.5,
  //   type: "vlm",
  //   supportsVision: true,
  //   visionModalities: ["image", "video"],
  //   supportsTools: false,
  //   contextWindow: 262_144,
  //   reasoning: { enabled: true, toggleable: false, defaultEffort: "on" },
  // },
};

// ─── Helpers (legacy; no live stream-path callers) ──────────────────────────

export function getLLMs(): ModelCapability[] {
  return Object.values(MODEL_REGISTRY).filter((m) => m.type === "llm");
}

export function getVLMs(): ModelCapability[] {
  return Object.values(MODEL_REGISTRY).filter((m) => m.type === "vlm");
}

// ─── Message type ────────────────────────────────────────────────────────────

export type NIMMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export interface NIMMessage {
  role: string;
  content: NIMMessageContent;
}

// ─── buildNIMPayload (legacy pre-AI-SDK-v6; no live callers post-Phase-4) ────

export function buildNIMPayload(
  modelId: string,
  messages: NIMMessage[],
  options: {
    stream: boolean;
    maxTokens?: number;
    temperature?: number;
    responseFormat?: object;
    tools?: object[];
    disableReasoning?: boolean;
    hideReasoning?: boolean;
  },
): Record<string, unknown> {
  const {
    stream,
    maxTokens,
    temperature,
    responseFormat,
    tools,
    disableReasoning,
    hideReasoning,
  } = options;

  const payload: Record<string, unknown> = {
    model: modelId,
    messages,
    stream,
    ...(maxTokens !== undefined && { max_tokens: maxTokens }),
    ...(temperature !== undefined && { temperature }),
    ...(responseFormat !== undefined && { response_format: responseFormat }),
    ...(tools !== undefined && { tools }),
  };

  const model = MODEL_REGISTRY[modelId];
  if (model?.disableParam && disableReasoning) {
    Object.assign(payload, model.disableParam);
  }
  if (model?.hideReasoningParam && hideReasoning) {
    Object.assign(payload, model.hideReasoningParam);
  }

  return payload;
}

// ─── NIMError ────────────────────────────────────────────────────────────────

export class NIMError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(String(body?.message ?? `NIM error ${status}`));
    this.name = "NIMError";
  }

  get isRetryable(): boolean {
    return [429, 500, 502, 503, 504].includes(this.status);
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isContextTooLong(): boolean {
    if (this.status !== 400) return false;
    const msg = String(this.body?.message ?? "").toLowerCase();
    return msg.includes("context");
  }
}

// ─── callNIM (legacy SSE async generator; no live callers post-Phase-4) ──────
// The AI SDK v6 streamText path (lib/ai/providers.ts `nim` openai-compatible
// provider) is the live streamer; callNIM/streamWithRetry are retained only for
// reference / potential direct-SSE fallback. See lib/ai/models.ts for the
// curated registry that drives the live path.

export async function* callNIM(
  payload: Record<string, unknown>,
  apiKey: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  interface SSEDelta {
    reasoning_content?: string;
    content?: string;
  }

  const res = await fetch(`${NIM_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      body = { message: await res.text().catch(() => "") };
    }
    throw new NIMError(res.status, body);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");

  const decoder = new TextDecoder();
  let buffer = "";
  let hasStartedReasoning = false;
  let hasFinishedReasoning = false;
  let prevInReasoning = false;
  let prevPartialRaw = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith("data: ")) continue;

        const data = line.slice(6);
        if (data === "[DONE]") {
          if (hasStartedReasoning && !hasFinishedReasoning) {
            yield "\n</thinking>\n\n";
            hasFinishedReasoning = true;
          }
          continue;
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(data) as Record<string, unknown>;
        } catch {
          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawChoices = parsed.choices as any[] | undefined;
        const delta: SSEDelta | undefined = rawChoices?.[0]?.delta;
        const reasoningContent = delta?.reasoning_content;
        const contentToken = delta?.content;

        if (reasoningContent !== undefined && reasoningContent.length > 0) {
          if (!hasStartedReasoning) hasStartedReasoning = true;
          if (prevPartialRaw) {
            yield prevPartialRaw;
            prevPartialRaw = "";
          }
          yield prevInReasoning ? reasoningContent : `\n<thinking>\n${reasoningContent}`;
          prevInReasoning = true;
          prevPartialRaw = "";
        } else if (contentToken !== undefined && contentToken.length > 0) {
          if (prevPartialRaw) {
            yield prevPartialRaw;
            prevPartialRaw = "";
          }
          if (hasStartedReasoning && !hasFinishedReasoning) {
            yield "\n</thinking>\n\n";
            hasFinishedReasoning = true;
          }
          yield contentToken;
          prevInReasoning = false;
        } else {
          prevPartialRaw += contentToken ?? "";
        }
      }
    }

    if (hasStartedReasoning && !hasFinishedReasoning) {
      yield `\n<thinking>\n${prevPartialRaw || ""}`;
    } else if (prevPartialRaw) {
      yield prevPartialRaw;
    }

    yield "[DONE]";
  } finally {
    reader.releaseLock();
  }
}

// ─── streamWithRetry (legacy; AI SDK v6 owns retry on the live path) ─────────

export interface StreamEngineOptions {
  payload: Record<string, unknown>;
  apiKey: string;
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
  maxRetries?: number;
}

const FIRST_DELAY = 1_000;
const MAX_DELAY = 8_000;

export async function streamWithRetry(options: StreamEngineOptions): Promise<void> {
  const { payload, apiKey, signal, onChunk, maxRetries = 3 } = options;
  let attempt = 0;
  while (true) {
    let partial = "";
    try {
      for await (const chunk of callNIM(payload, apiKey, signal)) {
        if (chunk === "[DONE]") return;
        partial += chunk;
        onChunk(chunk);
        if (partial.length > 10 && attempt < maxRetries) break;
      }
      return;
    } catch (err) {
      if (!(err instanceof NIMError)) throw err;
      const nimErr = err as NIMError;
      if (nimErr.isContextTooLong) throw err;
      if (nimErr.status === 401 || nimErr.status === 403) throw err;
      attempt++;
      if (attempt > maxRetries || !nimErr.isRetryable) throw err;
      if (partial.length > 0) {
        onChunk(`[RETRY_PARTIAL]${partial}`);
        partial = "";
      }
      const delay = Math.min(FIRST_DELAY * Math.pow(2, attempt - 1), MAX_DELAY);
      await new Promise((r) => setTimeout(r, delay));
      if (nimErr.isRateLimited) attempt--;
    }
  }
}
