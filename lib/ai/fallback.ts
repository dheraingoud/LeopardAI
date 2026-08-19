/**
 * Φ-fallback · cross-model hard-failure fallback for chat generation.
 *
 * AI SDK v7 has NO native cross-model failover (verified against ai@7.0.66:
 * `customProvider({ fallbackProvider })` is interface inheritance, not error
 * dispatch; `maxRetries` re-runs the SAME model). Leopard's harder-robustness
 * lever is the backgroundServe retry loop — it already builds a FRESH streamText
 * per attempt and only retries a CONTENT-FREE, terminal attempt (never re-runs a
 * turn whose text/tool output already committed → no duplicate side effects).
 *
 * This module supplies the two pieces the route needs to turn that retry into a
 * real cross-model failover:
 *   1. `buildFallbackModelChain(id, { max })` — an ORDERED allow-list of model
 *      ids to try (requested first, then the best next candidates). Pure + env-
 *      aware; unit-testable standalone.
 *   2. `isFallbackableErrorText(msg)` — classify an attempt's terminal error so
 *      we fall back ONLY on hard (5xx/network/timeout/empty) failures, never on
 *      4xx / auth / rate-limit (a misconfigured key would otherwise churn through
 *      every candidate for nothing).
 *
 * Bound: we build exactly `max` ids (the route passes maxAttempts), and only the
 * LAST attempt's model is the fallback — cost stays at most 2 requests for a
 * fully broken primary (NIM has no prompt caching, so a refused candidate wastes
 * exactly one reshot turn — why 4xx must NOT escalate).
 */

import {
  allowedModelIds,
  getDefaultChatModel,
  getModelById,
  isImageModel,
  isVideoModel,
} from "@/lib/ai/models";

/**
 * Ordered model-id chain for a generation: `requestedId` first, then the best
 * `max - 1` fallback candidates. Candidates prefer same-provider siblings, then
 * the server default, then any other active text model — each distinct from all
 * already-chosen, image/video models excluded (they don't run through the
 * streamText path the route guards with its own branch). Never returns fewer
 * than 1 id; never exceeds `max`.
 */
export function buildFallbackModelChain(
  requestedId: string,
  opts: { max: number } = { max: 2 },
): string[] {
  const cap = Math.max(1, Math.floor(opts.max));
  const chain: string[] = [];
  const seen = new Set<string>();

  const push = (id: string | undefined | null): void => {
    if (!id || seen.has(id) || chain.length >= cap) return;
    const m = getModelById(id);
    if (!m || isImageModel(id) || isVideoModel(id)) return;
    seen.add(id);
    chain.push(id);
  };

  push(requestedId);

  if (chain.length >= cap) return chain;

  const requested = getModelById(requestedId);

  // 1. Same-provider siblings (a dead NIM instance affects its whole family,
  //    so prefewer the SAME provider — same key, same base — before diversifying).
  for (const id of allowedModelIds) {
    if (chain.length >= cap) break;
    if (seen.has(id)) continue;
    const m = getModelById(id);
    if (m && requested && m.provider === requested.provider) push(id);
  }

  // 2. The server default (operator-configured trusted model) if not already in.
  if (chain.length < cap) push(getDefaultChatModel()?.id);

  // 3. Any remaining active text model (diversify provider as a last resort).
  if (chain.length < cap) {
    for (const id of allowedModelIds) {
      if (chain.length >= cap) break;
      push(id);
    }
  }

  return chain;
}

// Patterns that mark an attempt as a NON-recoverable-by-fallback configuration
// fault. All of these fail identically on ANY allow-listed model (same gateway
// key / same auth config), so escalating to the next model just burns a reshot
// turn + adds latency. Everything else (5xx, network drop, abort-by-timeout,
// empty output) may be instance-specific and IS worth a fallback try.
const NOT_FALLBACKABLE =
  /401|403|429|unauthorized|api\s?key|rate\s?limit|quota|payment|credit\s?card|invalid\s?request|not\s?allowed|model_not_allowed/i;

/** True when a terminal, content-free attempt SHOULD try the next model (a hard
 * / transient failure). False for auth/rate-limit/config errors that would recur
 * identically on every candidate. Safe on any unknown error shape. */
export function isFallbackableErrorText(input: unknown): boolean {
  const msg =
    typeof input === "string"
      ? input
      : input instanceof Error
        ? input.message
        : input && typeof input === "object" && "message" in input
          ? String((input as { message: unknown }).message)
          : String(input);
  return !NOT_FALLBACKABLE.test(msg);
}

/** Read the effective model id off a `streamText` result (used purely to record
 * which model actually served after a fallback). Best-effort; may be undefined. */
export function readResultModel(result: unknown): string | undefined {
  try {
    const r = result as { model?: { modelId?: string } } | null;
    return r?.model?.modelId ?? undefined;
  } catch {
    return undefined;
  }
}