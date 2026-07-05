/**
 * NVIDIA NIM API core library.
 *
 * Exports:
 *   NIM_BASE, UTILITY_MODEL, DEFAULT_MODEL
 *   ModelCapability, MODEL_REGISTRY
 *   getLLMs(), getVLMs()
 *   buildNIMPayload(), NIMError
 *   callNIM (async generator), streamWithRetry()
 */

// ─── ModelCapability interface ───────────────────────────────────────────────

export interface ModelCapability {
  id: string;
  displayName: string;
  speedTier: 1 | 1.5 | 3;
  type: "llm" | "vlm";
  supportsVision: boolean;
  reasoning: {
    enabledByDefault: boolean;
    disableParam?: Record<string, unknown>;
    hideReasoningParam?: Record<string, unknown>;
  };
}

// ─── Base URL and model defaults ────────────────────────────────────────────

export const NIM_BASE = "https://integrate.api.nvidia.com/v1";

export const UTILITY_MODEL = "stepfun-ai/step-3.5-flash";

export const DEFAULT_MODEL = "z-ai/glm-5.1";

// ─── MODEL_REGISTRY ──────────────────────────────────────────────────────────
// All 12 models: 9 LLMs + 3 VLMs

export const MODEL_REGISTRY: Record<string, ModelCapability> = {
  // ── LLMs ──────────────────────────────────────────────────────────────────
  "z-ai/glm-5.1": {
    id: "z-ai/glm-5.1",
    displayName: "GLM 5.1",
    speedTier: 3,
    type: "llm",
    supportsVision: false,
    reasoning: { enabledByDefault: false },
  },
  "deepseek-ai/deepseek-v3-2": {
    id: "deepseek-ai/deepseek-v3-2",
    displayName: "DeepSeek V3.2",
    speedTier: 3,
    type: "llm",
    supportsVision: false,
    reasoning: { enabledByDefault: false },
  },
  "qwen/qwen3-300b-a22b": {
    id: "qwen/qwen3-300b-a22b",
    displayName: "Qwen3 300B MoE",
    speedTier: 3,
    type: "llm",
    supportsVision: false,
    reasoning: { enabledByDefault: false },
  },
  "google/gemma-4-31b-it": {
    id: "google/gemma-4-31b-it",
    displayName: "Gemma 4 31B",
    speedTier: 1.5,
    type: "llm",
    supportsVision: false,
    reasoning: { enabledByDefault: false },
  },
  "meta/llama-3.3-70b-instruct": {
    id: "meta/llama-3.3-70b-instruct",
    displayName: "Llama 3.3 70B",
    speedTier: 1,
    type: "llm",
    supportsVision: false,
    reasoning: { enabledByDefault: false },
  },
  "minimaxai/minimax-m2.5": {
    id: "minimaxai/minimax-m2.5",
    displayName: "MiniMax M2.5",
    speedTier: 1,
    type: "llm",
    supportsVision: false,
    reasoning: { enabledByDefault: false },
  },
  "minimaxai/minimax-m2.7": {
    id: "minimaxai/minimax-m2.7",
    displayName: "MiniMax M2.7",
    speedTier: 1,
    type: "llm",
    supportsVision: false,
    reasoning: { enabledByDefault: false },
  },
  "stepfun-ai/step-3.5-flash": {
    id: "stepfun-ai/step-3.5-flash",
    displayName: "Step 3.5 Flash",
    speedTier: 1,
    type: "llm",
    supportsVision: false,
    reasoning: { enabledByDefault: false },
  },
  "moonshotai/kimi-k2.5": {
    id: "moonshotai/kimi-k2.5",
    displayName: "Kimi K2.5",
    speedTier: 1.5,
    type: "llm",
    supportsVision: false,
    reasoning: {
      enabledByDefault: true,
      disableParam: { chat_template_kwargs: { thinking: false } },
      hideReasoningParam: { include_reasoning: false },
    },
  },

  // ── VLMs ──────────────────────────────────────────────────────────────────
  "meta/llama-3.2-11b-vision-instruct": {
    id: "meta/llama-3.2-11b-vision-instruct",
    displayName: "Llama 3.2 11B Vision",
    speedTier: 1.5,
    type: "vlm",
    supportsVision: true,
    reasoning: { enabledByDefault: false },
  },
  "meta/llama-3.2-90b-vision-instruct": {
    id: "meta/llama-3.2-90b-vision-instruct",
    displayName: "Llama 3.2 90B Vision",
    speedTier: 3,
    type: "vlm",
    supportsVision: true,
    reasoning: { enabledByDefault: false },
  },
  "nvidia/llama-3.1-nemotron-nano-vl-8b-v1": {
    id: "nvidia/llama-3.1-nemotron-nano-vl-8b-v1",
    displayName: "Nemotron Nano VL 8B",
    speedTier: 1,
    type: "vlm",
    supportsVision: true,
    reasoning: { enabledByDefault: false },
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── buildNIMPayload ─────────────────────────────────────────────────────────

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

  // Apply reasoning control only for models that define it (Kimi K2.5)
  const model = MODEL_REGISTRY[modelId];
  if (model?.reasoning.disableParam) {
    if (disableReasoning) {
      Object.assign(payload, model.reasoning.disableParam);
    }
  }
  if (model?.reasoning.hideReasoningParam) {
    if (hideReasoning) {
      Object.assign(payload, model.reasoning.hideReasoningParam);
    }
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

// ─── callNIM (async generator) ───────────────────────────────────────────────

/**
 * SSE streaming async generator.
 * Yields content deltas as strings. Handles reasoning tokens by wrapping them in <thinking> tags.
 */
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

  // Tracks whether the previous emitted chunk was in reasoning mode
  let prevInReasoning = false;
  // Accumulates partial content tokens across iterations
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
          // Close reasoning block if we never closed it
          if (hasStartedReasoning && !hasFinishedReasoning) {
            yield "\n</think>\n\n";
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
          if (!hasStartedReasoning) {
            hasStartedReasoning = true;
          }

          // Flush any accumulated partial before opening a thinking block
          if (prevPartialRaw) {
            yield prevPartialRaw;
            prevPartialRaw = "";
          }

          if (prevInReasoning) {
            yield reasoningContent;
          } else {
            yield "\n<think>\n" + reasoningContent;
          }
          prevInReasoning = true;
          prevPartialRaw = "";
        } else if (contentToken !== undefined && contentToken.length > 0) {
          // Flush any accumulated partial before emitting content
          if (prevPartialRaw) {
            yield prevPartialRaw;
            prevPartialRaw = "";
          }

          // Close open thinking block
          if (hasStartedReasoning && !hasFinishedReasoning) {
            yield "\n</think>\n\n";
            hasFinishedReasoning = true;
          }

          yield contentToken;
          prevInReasoning = false;
        } else {
          // Accumulate partial (incomplete token) for next iteration
          prevPartialRaw += contentToken ?? "";
        }
      }
    }

    // Flush any residual partial when stream ends
    if (hasStartedReasoning && !hasFinishedReasoning) {
      yield "\n<think>\n" + (prevPartialRaw || "");
    } else if (prevPartialRaw) {
      yield prevPartialRaw;
    }

    yield "[DONE]";
  } finally {
    reader.releaseLock();
  }
}

// ─── streamWithRetry ─────────────────────────────────────────────────────────

export interface StreamEngineOptions {
  payload: Record<string, unknown>;
  apiKey: string;
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
  maxRetries?: number;
}

const FIRST_DELAY = 1_000;
const MAX_DELAY = 8_000;

/**
 * Wraps callNIM with exponential-backoff retry.
 * Partial content accumulated during a failed attempt is emitted via onChunk
 * as an assistant prefix before retrying.
 */
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

        // Break early to retry once we have partial content — avoids unbounded streaming
        if (partial.length > 10 && attempt < maxRetries) {
          break;
        }
      }
      // Should not reach here; [DONE] always exits above
      return;
    } catch (err) {
      if (!(err instanceof NIMError)) throw err;
      const nimErr = err as NIMError;

      // Do not retry context-overflow or auth errors
      if (nimErr.isContextTooLong) throw err;
      if (nimErr.status === 401 || nimErr.status === 403) throw err;

      attempt++;
      if (attempt > maxRetries || !nimErr.isRetryable) throw err;

      // Inject partial as assistant prefix before retrying
      if (partial.length > 0) {
        onChunk(`[RETRY_PARTIAL]${partial}`);
        partial = "";
      }

      // Exponential backoff: 1s → 2s → 4s, capped at 8s
      const delay = Math.min(FIRST_DELAY * Math.pow(2, attempt - 1), MAX_DELAY);
      await new Promise((r) => setTimeout(r, delay));

      // Rate-limit errors retry immediately without counting against attempt budget
      if (nimErr.isRateLimited) {
        attempt--;
      }
    }
  }
}