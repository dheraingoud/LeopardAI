/**
 * Model health probe — the "is this model actually serving" check behind the
 * selector's outage badges.
 *
 * For each active text model, fire a minimal 1-token chat completion and time
 * it. A model is `ok` only if a real token comes back inside the per-model
 * timeout; 401/403/404/429/5xx/timeout all map to a short machine `reason` the
 * client turns into a badge ("outage", "slow", …). This is what lets the UI
 * demote a hung/dead model instead of letting the user send into a black hole
 * (the 2026-10-05 "message disappears, retry fails" report traced to a
 * hard-403ing key that nothing surfaced).
 *
 * Runs server-side (the NIM key never reaches the browser). Concurrency-capped
 * so a login doesn't fire 9 simultaneous upstream calls. Cheap: max_tokens=3,
 * no stream read beyond the first byte.
 */
import { NextResponse } from "next/server";
import { getActiveModels } from "@/lib/ai/models";
import { currentNimKey, hasNimKey } from "@/lib/ai/nim-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Health = {
  id: string;
  ok: boolean;
  latencyMs: number | null;
  reason?: string;
};

const TIMEOUT_MS = 12_000;
const CONCURRENCY = 4;

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
        max_tokens: 3,
        stream: false,
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
    // 200 but confirm there's actually a completion body
    const json = (await res.json().catch(() => null)) as
      | { choices?: Array<unknown> }
      | null;
    if (!json?.choices?.length) {
      return { id, ok: false, latencyMs, reason: "empty" };
    }
    return { id, ok: true, latencyMs };
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
    return NextResponse.json(
      { error: "all NIM keys are down" },
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
