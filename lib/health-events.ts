/**
 * Pure helpers for the model-health stream — SSE frame parsing and the
 * checking→ok/down verdict. Kept free of imports so the tests can exercise
 * them without the client store or the "@/" alias chain.
 */

export type HealthStatus = "checking" | "ok" | "down";

export type HealthResult = {
  id: string;
  ok: boolean;
  latencyMs: number | null;
  speed?: "fast" | "slow" | "very_slow";
  reason?: string;
};

export type HealthStreamEvent =
  | { type: "start"; models: string[] }
  | { type: "result"; result: HealthResult }
  | { type: "done"; checkedAt: number }
  | { type: "error"; message: string };

export function takeHealthEvent(buffer: string): {
  event: HealthStreamEvent | null;
  rest: string;
} {
  const split = buffer.indexOf("\n\n");
  if (split === -1) return { event: null, rest: buffer };
  const raw = buffer.slice(0, split);
  const rest = buffer.slice(split + 2);
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    try {
      return { event: JSON.parse(line.slice(5).trim()) as HealthStreamEvent, rest };
    } catch {
      return { event: null, rest };
    }
  }
  return { event: null, rest };
}

export function healthStatusFor(result: { ok: boolean }): HealthStatus {
  return result.ok ? "ok" : "down";
}

export function healthLabel(h: { ok: boolean; status: HealthStatus } | undefined): string | undefined {
  if (!h || h.ok || h.status === "checking") return undefined;
  return "Currently down";
}

export function speedLabel(
  h: { ok: boolean; speed?: "fast" | "slow" | "very_slow" } | undefined,
): string | undefined {
  if (!h?.ok) return undefined;
  if (h.speed === "slow") return "Slow";
  if (h.speed === "very_slow") return "Very slow";
  return undefined;
}
