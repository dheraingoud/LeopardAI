"use client";

/**
 * Model health store — the client side of /api/models/health.
 *
 * Fetched on first mount and re-validated at most every 5 min, NOT on every
 * selector open. A model reported `!ok` is demoted to the bottom of the
 * picker and badged "Currently down". When the whole fleet is down (a dead
 * key — the 2026-10-05
 * incident), every model reports auth-down and the picker shows a global
 * banner instead of letting the user send into a black hole.
 */
import { create } from "zustand";

export type ModelHealth = {
  id: string;
  ok: boolean;
  latencyMs: number | null;
  /** Latency tier when ok (slow ≠ down — big models have slow TTFT). */
  speed?: "fast" | "slow" | "very_slow";
  reason?: string;
};

type HealthState = {
  /** id → health. Empty until the first probe resolves. */
  byId: Record<string, ModelHealth>;
  /** True once a probe completed this session (even if all failed). */
  loaded: boolean;
  /** Epoch ms of the last completed probe — drives the revalidate window. */
  checkedAt: number;
  /** In-flight guard so parallel mounts fire one fetch. */
  _inflight: Promise<void> | null;
  load: () => void;
  /** Force a re-probe (e.g. after the user rotates a key / recovers). */
  refresh: () => void;
};

/** Re-probe at most every 5 min — a model that recovered must lose its
 *  "Currently down" badge within a session, not just on the next login. */
const REVALIDATE_MS = 5 * 60_000;

async function fetchHealth(): Promise<Record<string, ModelHealth>> {
  try {
    const res = await fetch("/api/models/health", { cache: "no-store" });
    // 503 = every key down (route short-circuits before probing). That's the
    // exact fleet-down case the banner exists for — DON'T swallow it into {}
    // (which read as "not loaded" and hid the banner, audit 2026-10-06).
    if (res.status === 503) {
      const json = (await res.json().catch(() => null)) as { models?: string[] } | null;
      const byId: Record<string, ModelHealth> = {};
      for (const id of json?.models ?? []) byId[id] = { id, ok: false, latencyMs: null, reason: "auth" };
      return byId;
    }
    if (!res.ok) return {};
    const json = (await res.json()) as { results?: ModelHealth[] };
    const byId: Record<string, ModelHealth> = {};
    for (const r of json.results ?? []) byId[r.id] = r;
    return byId;
  } catch {
    return {};
  }
}

export const useModelHealth = create<HealthState>()((set, get) => ({
  byId: {},
  loaded: false,
  checkedAt: 0,
  _inflight: null,
  load: () => {
    if (get()._inflight) return;
    // Within the revalidate window a completed probe stands — no request
    // storm from remounts; past it, re-check so recovered models return.
    if (get().loaded && Date.now() - get().checkedAt < REVALIDATE_MS) return;
    const p = fetchHealth().then((byId) => {
      set({ byId, loaded: true, checkedAt: Date.now(), _inflight: null });
    });
    set({ _inflight: p });
  },
  refresh: () => {
    set({ _inflight: null, loaded: false, checkedAt: 0 });
    get().load();
  },
}));

/**
 * Down badge for a model's health. undefined = healthy/unknown.
 * Product wording is fixed: a failed probe reads "Currently down" regardless
 * of the machine reason (auth/timeout/5xx) — users act on the state, not the
 * cause. Slow-but-serving models are ok:true and get a SPEED badge instead
 * (see speedLabel) — latency is not an outage.
 */
export function healthLabel(h: ModelHealth | undefined): string | undefined {
  if (!h || h.ok) return undefined;
  return "Currently down";
}

/** Speed badge for a healthy model — undefined for fast (the default reading). */
export function speedLabel(h: ModelHealth | undefined): string | undefined {
  if (!h?.ok) return undefined;
  if (h.speed === "slow") return "Slow";
  if (h.speed === "very_slow") return "Very slow";
  return undefined;
}
