/**
 * NVIDIA NIM API core library.
 *
 * Goal-driven curation (2026-08-24): the chat registry exposes ONLY the live,
 * curated set mapped from the NIM /v1/models endpoint —
 *   moonshotai/kimi-k3 (DEFAULT), minimax-m3, gemma-4-31b-it, step-3.7-flash,
 *   diffusiongemma-26b-a4b-it, muse-glimmer-30b, thinkingmachines-inkling,
 *   poolside-laguna-xs-2.1, nemotron-3.5-lightning-30b-a3b,
 *   deepseek-v4-flash-0731 (kept, flagged unavailable — upstream hang).
 * glm-5.2 removed 2026-08-24 (deprecated — no longer in /v1/models).
 * All ids verified present in /v1/models (2026-08-24 probe: 102 models).
 * deepseek-v4-pro is NOT
 * in the catalogue and was dropped. minimax-m3 is a TEXT LLM on NIM (no vision
 * modality despite earlier card reads). diffusiongemma is a TEXT-OUT VLM (takes
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
   *                        mode. Binary on/off effort models (minimax/step)
   *                        map ON → "high".
   *   "think"           → { nim: { chat_template_kwargs: { think: bool } } }
   *                        (literal pass-through).
   *   "enable_thinking" → { nim: { chat_template_kwargs:
   *                                { enable_thinking: bool } } } (literal
   *                        pass-through). Used by NIM for GLM-5.2 / minimax-m3
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
   * (gemma / diffusion / minimax / step expose only a think toggle). Present ⇒
   * the bar renders an effort slider the user drags between these stops.
   */
  effortLevels?: ReasoningLevel[];
  /** What the bar initializes the selector to — "off" or a default effort tier. */
  defaultEffort: ReasoningLevel;
}

export interface ModelCapability {
  id: string;
  displayName: string;
  speedTier: 1 | 1.5 | 3;
  type: "llm" | "vlm";
  supportsVision: boolean;
  /**
   * Which vision modalities the model accepts — gates the PlusMenu media
   * picker's accept list + the "needs VLM" / "no video" hints. step-3.7-flash
   * takes image ONLY (no video) per its card; the rest take image+video.
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

// Utility = step-3.7-flash (per goal: "step 3.7 flash (not 3.5)"). Fast, used
// for server-side title generation (low stakes — no reasoning sent for titles).
export const UTILITY_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b"; // title-gen pinned to nemotron-3.5-lightning (2026-08-28): step-3.7-flash 410s on THIS key for non-streaming calls though it serves chat fine; entry stays in the picker

// Default chat model. History of the default:
//   z-ai/glm-5.2 (stalled upstream, then pulled from the NIM catalogue 2026-08-24)
//   → step-3.7-flash (interim) → deepseek-v4-flash-0731 (defaulted 2026-08-20,
//     then HUNG both thinking + non-thinking 2026-08-24 — empty body in 45s).
// Defaulted moonshotai/kimi-k3 2026-08-24, but kimi stalls mid-stream (90s
// chunk gaps) in practice → operator switch 2026-08-30 to
// google/diffusiongemma-26b-a4b-it (stable, fast; enable_thinking reasoning
// verified 2026-07-11). kimi stays in the picker.
export const DEFAULT_MODEL = "google/diffusiongemma-26b-a4b-it";

// ─── MODEL_REGISTRY (curated: text LLMs/VLMs mapped from /v1/models) ──────────
// contextWindow + vision modality + reasoning config hard-coded from the
// build.nvidia model cards (NIM /v1/models exposes no metadata). All ids below
// verified present in /v1/models 2026-08-17. minimax-m3 is a TEXT LLM (NDA).
// glm-5.2 + deepseek-v4-flash-0731 are text-only; gemma-4 / step-3.7 /
// diffusiongemma accept image/video (vision). The 4 additions (muse-glimmer /
// thinkingmachines-inkling / poolside-laguna-xs-2.1 / nemotron-3.5-lightning)
// are lean-in-setting reasoners — binary effort toggle (param:"effort") until
// their /chat/completions reasoning_content probes seed real tiers.
//
// DOWN (2026-07-11): minimaxai/minimax-m3 returned "Bad Request" from NIM —
// external downtime, confirmed by user. Keep entry; re-test when NIM recovers.

export const MODEL_REGISTRY: Record<string, ModelCapability> = {
  "minimaxai/minimax-m3": {
    id: "minimaxai/minimax-m3",
    displayName: "MiniMax M3",
    speedTier: 1.5,
    type: "llm", // text model on NIM — no vision modality (2026-08-17)
    supportsVision: false,
    supportsTools: true,
    contextWindow: 1_000_000,
    // Long-context reasoner; on/off toggle. NIM probe 2026-07-11:
    // `reasoning_effort:"max"` + `reasoning_effort:"high"` both accepted
    // (HTTP 200) but NIM emits `reasoning_content:null` on every chunk.
    // `chat_template_kwargs:{enable_thinking:true}` is what makes NIM
    // actually populate `reasoning_content` (74 chunks observed).
    reasoning: {
      enabled: true,
      toggleable: true,
      param: "enable_thinking",
      defaultEffort: "on",
    },
  },
  // GLM 5.2 removed 2026-08-24 — deprecated + pulled from the NIM /v1/models
  // catalogue (probe returns zero glm ids). Do not re-add.
  "moonshotai/kimi-k3": {
    id: "moonshotai/kimi-k3",
    displayName: "Kimi K3",
    speedTier: 1.5,
    type: "llm",
    supportsVision: false,
    supportsTools: true,
    contextWindow: 262_144,
    // Probed live 2026-08-24: responds without params (reasoning_content
    // populated by default); `reasoning_effort` accepts ONLY low/high/max —
    // NIM 400s on "medium" ("supported values are low, high, and max").
    // high/max emit long reasoning (need a generous token budget);
    // `chat_template_kwargs:{enable_thinking:false}` cleanly disables reasoning.
    reasoning: {
      enabled: true,
      toggleable: true,
      param: "effort",
      effortLevels: ["low", "high", "max"],
      defaultEffort: "low",
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
  "deepseek-ai/deepseek-v4-flash-0731": {
    id: "deepseek-ai/deepseek-v4-flash-0731",
    displayName: "DeepSeek V4 Flash 0731",
    speedTier: 1,
    type: "llm",
    supportsVision: false,
    supportsTools: true,
    contextWindow: 1_000_000,
    // 2026-08-24: hangs on NIM — empty body after 45s in BOTH thinking and
    // non-thinking modes. Kept in the picker (operator request) but flagged
    // unavailable so the UI greys it out until NIM restores the upstream.
    unavailable: true,
    unavailableReason: "Upstream hang (empty response) — NIM",
    // Probe 2026-07-09: reasoning_effort "high"+"max" both → 200 + reasoning_content emitted.
    reasoning: {
      enabled: true,
      toggleable: true,
      param: "effort",
      effortLevels: ["high", "max"],
      // Latency-optimized default (2026-08-20): the "medium" intent here is
      // "HIGH", this card's only non-extreme stop. "max" held the first token
      // behind long deliberation on a speed-1 flash model. Users who want deep
      // thinking still get it via the picker (max is one tick away).
      defaultEffort: "high",
    },
  },
  // Operator request 2026-08-28: full V4 Pro alongside the (currently hanging)
  // Flash card. Probed live same day (title-gen call returned cleanly).
  "deepseek-ai/deepseek-v4-pro-0813": {
    id: "deepseek-ai/deepseek-v4-pro-0813",
    displayName: "DeepSeek V4 Pro 0813",
    speedTier: 3,
    type: "llm",
    supportsVision: false,
    supportsTools: true,
    contextWindow: 1_000_000,
    reasoning: {
      enabled: true,
      toggleable: true,
      param: "effort",
      effortLevels: ["high", "max"],
      defaultEffort: "high",
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
    reasoning: {
      enabled: true,
      toggleable: true,
      param: "effort",
      defaultEffort: "on",
    },
  },
  "thinkingmachines/inkling": {
    id: "thinkingmachines/inkling",
    displayName: "Inkling",
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
  "stepfun-ai/step-3.7-flash": {
    id: "stepfun-ai/step-3.7-flash",
    displayName: "Step 3.7 Flash",
    speedTier: 1,
    type: "vlm",
    supportsVision: true,
    visionModalities: ["image"], // card: text+image only, NO video input
    supportsTools: true,
    contextWindow: 262_144,
    reasoning: { enabled: true, toggleable: true, param: "effort", defaultEffort: "on" },
    // NIM 2026-08-29: 404 on /chat/completions — pulled from the catalogue.
    unavailable: true,
    unavailableReason: "removed from NIM catalogue",
  },
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
