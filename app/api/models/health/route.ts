/**
 * Model health probe — the "is this model actually serving" check behind the
 * selector's outage badges.
 *
 * For each active text model, fire a minimal 1-token chat completion and time
 * it. A model is `ok` when a real token comes back inside the window — the
 * response LATENCY is classified (`fast`/`slow`/`very_slow`) and surfaced as a
 * speed badge, never as a down state: big models have slow TTFT under queueing
 * and slow ≠ down. Only NO response (timeout/401/403/404/429/5xx/empty) marks
 * a model `!ok` → the picker's "Currently down" badge + demotion. This is what
 * lets the UI demote a hung/dead model instead of letting the user send into a
 * black hole (the 2026-10-05 "message disappears, retry fails" report traced
 * to a hard-403ing key that nothing surfaced).
 *
 * Runs server-side (the NIM key never reaches the browser). Concurrency-capped
 * so a login doesn't fire 9 simultaneous upstream calls. Cheap: max_tokens=1,
 * thinking explicitly off, no stream read.
 */
import { NextResponse } from "next/server";
import { getActiveModels } from "@/lib/ai/models";
import { currentNimKey, hasNimKey } from "@/lib/ai/nim-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SpeedClass = "fast" | "slow" | "very_slow";

type Health = {
  id: string;
  /** ok = the model served a real token inside the window. Slow-but-serving
   *  is ok:true — latency is surfaced via `speed`, never as a down badge. */
  ok: boolean;
  latencyMs: number | null;
  /** Latency tier for healthy models; undefined when down. */
  speed?: SpeedClass;
  reason?: string;
};

// 120s, not 45s: big models (kimi-k3, glm-5.3) have legitimately slow TTFT
// under NIM queueing — 45s misread a slow-but-up fleet as down (user report
// 2026-10-08: "larger models have more latency in ttft.. doesnt mean its
// down"). Only NO response at all (timeout/auth/5xx) marks a model down.
const TIMEOUT_MS = 120_000;
// 2 workers, not 4: concurrent probes throttle each other at the NIM queue
// (at 4, even the 7s-solo nemotron timed out at 120s during the 2026-10-08
// jitter window). 9 models × 2-wide ≈ 5 waves — acceptable for a background
// probe that never blocks the UI.
const CONCURRENCY = 2;

/** Latency tiers for the picker's speed badge. */
function classifySpeed(latencyMs: number): SpeedClass {
  if (latencyMs < 5_000) return "fast";
  if (latencyMs < 20_000) return "slow";
  return "very_slow";
}

async function probe(id: string, apiKey: string): Promise<Health> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: id,
        messages: [{ role: "user", content: "hi" }],
        // Exactly 1 token: the health criterion is usage.completion_tokens === 1
        // (checked below), not merely "some text came back".
        max_tokens: 1,
        stream: false,
        // Thinking OFF — explicit. Omitting it leaves the model at its upstream
        // default, and nemotron-3.5-lightning defaults to thinking ON (live
        // probe 2026-09-05), which would burn reasoning tokens against the
        // 12s timeout and misreport a healthy model as slow/timed-out.
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: ctrl.signal,
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        id,
        ok: false,
        latencyMs,
        reason:
          res.status === 401 || res.status === 403
            ? "auth"
            : res.status === 404
              ? "not_found"
              : res.status === 429
                ? "rate_limited"
                : `http_${res.status}`,
      };
    }
    // 200 is not enough — the health criterion is the provider's own usage
    // metadata: exactly 1 completion token (max_tokens=1 above). A 200 with an
    // empty choice list, missing usage, or 0 tokens means the model served
    // nothing and is treated as down. If NIM ever stops returning usage on
    // non-streamed completions, fall back to requiring a non-empty message.
    const json = (await res.json().catch(() => null)) as
      | {
          choices?: Array<{ message?: { content?: unknown } }>;
          usage?: { completion_tokens?: number };
        }
      | null;
    const completionTokens = json?.usage?.completion_tokens;
    if (typeof completionTokens === "number") {
      if (completionTokens !== 1) {
        return { id, ok: false, latencyMs, reason: "empty" };
      }
      return { id, ok: true, latencyMs, speed: classifySpeed(latencyMs) };
    }
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.length > 0) {
      return { id, ok: true, latencyMs, speed: classifySpeed(latencyMs) };
    }
    return { id, ok: false, latencyMs, reason: "empty" };
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    return {
      id,
      ok: false,
      latencyMs: Date.now() - start,
      reason: aborted ? "timeout" : "network",
    };
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  if (!hasNimKey()) {
    return NextResponse.json(
      { error: "NVIDIA_API_KEY not configured" },
      { status: 500 },
    );
  }
  // Probe with the CURRENT best key from the rotator pool (not the raw env) so
  // a demoted/dead legacy key doesn't misreport the whole fleet as auth-down.
  const apiKey = currentNimKey();
  if (!apiKey) {
    // Include the model ids so the client can still badge every row as down
    // (the picker's fleet-down banner reads these; an empty list hid it).
    const models = getActiveModels()
      .filter((m) => m.kind !== "image" && m.kind !== "video")
      .map((m) => m.id);
    return NextResponse.json(
      { error: "all NIM keys are down", models },
      { status: 503 },
    );
  }
  // Only text LLMs are health-probed (chat completions). Vision/image models
  // share the same upstream; if the key is down everything reports auth anyway.
  const models = getActiveModels().filter((m) => m.kind !== "image" && m.kind !== "video");

  const results: Health[] = [];
  let i = 0;
  async function worker() {
    while (i < models.length) {
      const m = models[i++];
      if (!m) return;
      results.push(await probe(m.id, apiKey!));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, models.length) }, worker));

  return NextResponse.json({ checkedAt: Date.now(), results });
}
