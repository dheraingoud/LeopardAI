"use client";

/**
 * Model health store — the client side of /api/models/health.
 *
 * Fetched once per app session (in-memory cache + a revalidate window), NOT on
 * every selector open. A model reported `!ok` is demoted to the bottom of the
 * picker and badged; the reason maps to a human label ("Outage", "Slow",
 * "Unavailable"). When the whole fleet is down (a dead key — the 2026-10-05
 * incident), every model reports auth-down and the picker shows a global
 * banner instead of letting the user send into a black hole.
 */
import { create } from "zustand";

export type ModelHealth = {
  id: string;
  ok: boolean;
  latencyMs: number | null;
  reason?: string;
};

type HealthState = {
  /** id → health. Empty until the first probe resolves. */
  byId: Record<string, ModelHealth>;
  /** True once a probe completed this session (even if all failed). */
  loaded: boolean;
  /** In-flight guard so parallel mounts fire one fetch. */
  _inflight: Promise<void> | null;
  load: () => void;
  /** Force a re-probe (e.g. after the user rotates a key / recovers). */
  refresh: () => void;
};

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
  _inflight: null,
  load: () => {
    if (get()._inflight) return;
    const p = fetchHealth().then((byId) => {
      set({ byId, loaded: true, _inflight: null });
    });
    set({ _inflight: p });
  },
  refresh: () => {
    set({ _inflight: null, loaded: false });
    get().load();
  },
}));

/** Human badge for a model's health. undefined = healthy/unknown. */
export function healthLabel(h: ModelHealth | undefined): string | undefined {
  if (!h || h.ok) return undefined;
  switch (h.reason) {
    case "auth":
      return "Outage";
    case "rate_limited":
      return "Busy";
    case "timeout":
      return "Slow";
    case "not_found":
      return "Removed";
    default:
      return "Down";
  }
}
