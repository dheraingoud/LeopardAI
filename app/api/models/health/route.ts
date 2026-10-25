/**
 * Model health probe — is this model actually serving? Backs the selector's
 * dots: grey (checking), green (answered), red (no answer).
 */
import { NextResponse } from "next/server";
import { getActiveModels, type ChatModel } from "@/lib/ai/models";
import {
  hasNimKey,
  leaseNimKey,
  reportNimKeyFailure,
  usableNimKeyCount,
} from "@/lib/ai/nim-keys";
import { convexClient } from "@/lib/ai/server-generation";
import { api } from "@/convex/_generated/api";

const CACHE_FRESH_MS = 35 * 60_000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SpeedClass = "fast" | "slow" | "very_slow";

type Health = {
  id: string;
  ok: boolean;
  latencyMs: number | null;
  speed?: SpeedClass;
  reason?: string;
};

type ProbeResult = Health & { status?: number };

const TIMEOUT_MS = 120_000;
const SWEEP_DEADLINE_MS = 240_000;
const KEY_ATTEMPTS = 3;
const LEASE_WAIT_MS = 250;

function classifySpeed(latencyMs: number): SpeedClass {
  if (latencyMs < 5_000) return "fast";
  if (latencyMs < 20_000) return "slow";
  return "very_slow";
}

async function probe(
  id: string,
  apiKey: string,
  external?: AbortSignal,
): Promise<ProbeResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const onExternal = () => ctrl.abort();
  external?.addEventListener("abort", onExternal, { once: true });
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
        max_tokens: 1,
        stream: false,
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: ctrl.signal,
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      await res.text().catch(() => "");
      return {
        id,
        ok: false,
        latencyMs,
        status: res.status,
        reason:
          res.status === 401 || res.status === 403
            ? "auth"
            : res.status === 404
              ? "not_found"
              : res.status === 429
                ? "rate_limited"
                : res.status >= 500
                  ? "server_error"
                  : `http_${res.status}`,
      };
    }
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
    external?.removeEventListener("abort", onExternal);
  }
}

function isKeyFailure(reason: string | undefined): boolean {
  return reason === "auth" || reason === "rate_limited" || reason === "server_error";
}

/**
 * Probe one model on its own key, moving to a free key when that one fails.
 *
 * A 429/5xx is ACCOUNT saturation ("Worker local total request limit"), not a
 * broken key — so the key is NOT demoted for it. Demoting it would shrink the
 * pool mid-sweep (the worker count is fixed at the start) and every remaining
 * model would starve, which is how healthy models ended up red. Only a
 * 401/403 kills the key.
 */
async function probeWithLeasedKey(
  id: string,
  leased: Set<string>,
  deadline: number,
  external?: AbortSignal,
): Promise<Health> {
  let last: ProbeResult | null = null;
  for (let attempt = 0; attempt < KEY_ATTEMPTS; attempt++) {
    if (external?.aborted) break;
    if (Date.now() >= deadline) break;
    let apiKey = leaseNimKey(leased);
    while (!apiKey && !external?.aborted && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, LEASE_WAIT_MS));
      apiKey = leaseNimKey(leased);
    }
    if (!apiKey) break;
    leased.add(apiKey);
    try {
      const r = await probe(id, apiKey, external);
      last = r;
      if (r.ok) return r;
      if (!isKeyFailure(r.reason)) return r;
      if (r.reason === "auth") reportNimKeyFailure(apiKey, r.status);
    } finally {
      leased.delete(apiKey);
    }
  }
  return last ?? { id, ok: false, latencyMs: null, reason: "no_key" };
}

async function sweep(
  models: ChatModel[],
  onResult: (r: Health) => void,
  external?: AbortSignal,
): Promise<Health[]> {
  const results: Health[] = [];
  const leased = new Set<string>();
  const pending = new Map<string, AbortController>();
  const deadline = Date.now() + SWEEP_DEADLINE_MS;
  let i = 0;

  const worker = async () => {
    while (i < models.length) {
      if (Date.now() >= deadline) return;
      if (external?.aborted) return;
      const m = models[i++];
      if (!m) return;
      const ctrl = new AbortController();
      const onExternal = () => ctrl.abort();
      external?.addEventListener("abort", onExternal, { once: true });
      pending.set(m.id, ctrl);
      const r = await probeWithLeasedKey(m.id, leased, deadline, ctrl.signal);
      pending.delete(m.id);
      external?.removeEventListener("abort", onExternal);
      results.push(r);
      onResult(r);
    }
  };

  const workers = Array.from(
    {
      length: Math.max(
        1,
        Math.min(usableNimKeyCount(), models.length),
      ),
    },
    () => worker(),
  );

  const timer = setTimeout(() => {
    for (const ctrl of pending.values()) ctrl.abort();
  }, Math.max(0, deadline - Date.now()));

  await Promise.all(workers);
  clearTimeout(timer);

  const seen = new Set(results.map((r) => r.id));
  for (const m of models) {
    if (seen.has(m.id)) continue;
    const r: Health = {
      id: m.id,
      ok: false,
      latencyMs: null,
      reason: "timeout",
    };
    results.push(r);
    onResult(r);
  }
  return results;
}

function recordResults(db: ReturnType<typeof convexClient>, results: Health[]) {
  if (!db) return;
  const checkedAt = Date.now();
  for (const r of results) {
    void db
      .mutation(api.health.record, {
        modelId: r.id,
        ok: r.ok,
        latencyMs: r.latencyMs ?? undefined,
        reason: r.reason,
        speed: r.speed,
        checkedAt,
      })
      .catch(() => {});
  }
}

export async function GET(request: Request) {
  if (!hasNimKey()) {
    return NextResponse.json(
      { error: "NVIDIA_API_KEY not configured" },
      { status: 500 },
    );
  }

  const params = new URL(request.url).searchParams;
  const recordMode = params.get("record") === "1";
  const streamMode = params.get("stream") === "1";

  const models = getActiveModels().filter(
    (m) => m.kind !== "image" && m.kind !== "video",
  );
  const db = convexClient();

  if (streamMode) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: unknown) => {
          if (request.signal.aborted) return;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
          );
        };
        try {
          send({ type: "start", models: models.map((m) => m.id) });
          const results = await sweep(
            models,
            (r) => send({ type: "result", result: r }),
            request.signal,
          );
          recordResults(db, results);
          send({ type: "done", checkedAt: Date.now() });
        } catch (e) {
          if (!request.signal.aborted) {
            send({ type: "error", message: (e as Error)?.message ?? "sweep failed" });
          }
        } finally {
          try {
            controller.close();
          } catch {
            /* already closed by the client disconnecting */
          }
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  if (!recordMode && db) {
    try {
      const rows = (await db.query(api.health.latest, {})) as Array<{
        modelId: string;
        ok: boolean;
        latencyMs?: number;
        reason?: string;
        speed?: string;
        checkedAt: number;
      }>;
      if (rows.length > 0) {
        const freshest = Math.max(...rows.map((r) => r.checkedAt));
        if (Date.now() - freshest < CACHE_FRESH_MS) {
          return NextResponse.json({
            checkedAt: freshest,
            cached: true,
            results: rows.map((r) => ({
              id: r.modelId,
              ok: r.ok,
              latencyMs: r.latencyMs ?? null,
              reason: r.reason,
              speed: r.speed,
            })),
          });
        }
      }
    } catch {
      /* cache read failed — fall through to a live probe */
    }
  }

  const results = await sweep(models, () => {});
  recordResults(db, results);
  return NextResponse.json({ checkedAt: Date.now(), cached: false, results });
}
