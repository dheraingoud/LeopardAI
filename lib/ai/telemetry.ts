/**
 * Φ-docs · per-turn cost + latency + tool observability (P2.4 feeder).
 *
 * AI SDK v7 renames the old experimental_telemetry to a plain `telemetry` option
 * and the "collector" is now a custom `Telemetry` integration (registerTelemetry
 * for globals, or `telemetry: { integrations }` per call). We use a per-call
 * integration so it can carry the route's chatId/userId — and so NONE of it
 * leaks to the browser.
 *
 * Two responsibilities (deliberately not mixed into a second usage WRITE):
 *   1. `estimateCostUsd` — fills `estimatedCostUsd` on the usage row the
 *      background task already records, so the P2.4 readout shows a real cost.
 *      We DON'T fabricate provider prices: the operator opts in via
 *      `LEOPARD_MODEL_PRICING` = JSON { "<modelId-or-prefix*>": { input, output } }
 *      (USD per 1M tokens). No env → cost stays undefined (readout omits $).
 *   2. `chatUsageTelemetry` — logs per-LLM-call tokens/latency/tool-calls +
 *      a whole-operation total. Logging only; the usage ROW is still written by
 *      backgroundServe's committed-turn recordUsage, so we can't double-count a
 *      turn or record a failed/empty attempt. `recordInputs/outputs:false`
 *      suppresses payloads, not these events.
 */

import { type Telemetry } from "ai";

export type ModelPricing = { input: number; output: number };

/** Parse the operator pricing table. Empty/unset/invalid → {} (no cost shown). */
export function parseModelPricing(envValue: string | undefined): Record<string, ModelPricing> {
  if (!envValue) return {};
  try {
    const raw = JSON.parse(envValue) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, ModelPricing> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const rec = v as Partial<ModelPricing>;
      if (typeof rec?.input === "number" && typeof rec.output === "number" && k) {
        out[k] = { input: rec.input, output: rec.output };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** USD for a call under the operator pricing table; `*`-suffix keys are prefixes
 * (e.g. "meta/llama-*" matches any llama). undefined when unpriced/unknown. */
export function estimateCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number | undefined {
  const table = parseModelPricing(process.env.LEOPARD_MODEL_PRICING);
  if (!table || Object.keys(table).length === 0) return undefined;
  const price =
    table[modelId] ??
    Object.entries(table).find(
      ([k, v]) => k.endsWith("*") && modelId.startsWith(k.slice(0, -1)),
    )?.[1];
  if (!price) return undefined;
  const input = Number.isFinite(inputTokens) ? inputTokens : 0;
  const output = Number.isFinite(outputTokens) ? outputTokens : 0;
  return (input * price.input + output * price.output) / 1_000_000;
}

/** Mirrors the docs' recommendation to report usage from the SUCCESSFUL attempt
 * only; a stream that errored mid-way can yield partial usage — the caller
 * (backgroundServe) already guards recordUsage on `committed`. */
export function chatUsageTelemetry(opts?: {
  chatId?: string;
  userId?: string;
}): Telemetry {
  const { chatId, userId } = opts ?? {};
  return {
    // One event per provider LLM call — the per-turn token/latency/tool target.
    // Multi-step (tool-loop) turns emit several of these; onEnd.usage aggregates.
    onLanguageModelCallEnd: async (event) => {
      try {
        const input = event.usage.inputTokens ?? 0;
        const output = event.usage.outputTokens ?? 0;
        const parts = event.content as unknown as Array<{ type?: string; name?: string }>;
        const tools = parts.filter((p) => p.type === "tool-call").map((p) => p.name ?? "?");
        console.log(
          "[usage] llm-end " +
            JSON.stringify({
              provider: event.provider,
              model: event.modelId,
              input,
              output,
              total: input + output,
              latencyMs: event.performance?.responseTimeMs,
              finishReason: event.finishReason,
              costUsd: estimateCostUsd(event.modelId, input, output),
              toolCalls: tools,
              callId: event.callId,
              ...(chatId ? { chatId } : {}),
              ...(userId ? { userId } : {}),
            }),
        );
      } catch {
        /* telemetry must never break the stream */
      }
    },
  };
}