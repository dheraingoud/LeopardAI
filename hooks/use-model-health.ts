"use client";

/**
 * Model health store — client side of /api/models/health. Tri-state per model:
 * checking (grey), ok (green), down (red).
 */
import { create } from "zustand";
import { getActiveModels } from "@/lib/ai/models";
import {
  healthLabel as sharedHealthLabel,
  healthStatusFor,
  speedLabel as sharedSpeedLabel,
  takeHealthEvent,
  type HealthStatus,
} from "@/lib/health-events";

export type { HealthStatus };

export type ModelHealth = {
  id: string;
  ok: boolean;
  latencyMs: number | null;
  speed?: "fast" | "slow" | "very_slow";
  reason?: string;
  status: HealthStatus;
};

type HealthState = {
  byId: Record<string, ModelHealth>;
  loaded: boolean;
  checking: boolean;
  checkedAt: number;
  startedAt: number;
  error: string | null;
  _inflight: Promise<void> | null;
  _abort: AbortController | null;
  load: () => void;
  refresh: () => void;
  _run: (force: boolean) => Promise<void>;
};

const REVALIDATE_MS = 5 * 60_000;

function seedChecking(): Record<string, ModelHealth> {
  const byId: Record<string, ModelHealth> = {};
  for (const m of getActiveModels()) {
    byId[m.id] = { id: m.id, ok: false, latencyMs: null, status: "checking" };
  }
  return byId;
}

export const useModelHealth = create<HealthState>()((set, get) => ({
  byId: seedChecking(),
  loaded: false,
  checking: false,
  checkedAt: 0,
  startedAt: 0,
  error: null,
  _inflight: null,
  _abort: null,

  load: () => {
    if (get()._inflight) return;
    if (get().loaded && Date.now() - get().checkedAt < REVALIDATE_MS) return;
    void get()._run(false);
  },

  refresh: () => {
    get()._abort?.abort();
    set({ _inflight: null, loaded: false, checkedAt: 0 });
    void get()._run(true);
  },

  _run: async (force: boolean) => {
    if (!force && get()._inflight) return;
    const ctrl = new AbortController();
    const current = () => get()._abort === ctrl;
    set({
      _abort: ctrl,
      _inflight: Promise.resolve(),
      checking: true,
      startedAt: Date.now(),
      error: null,
    });
    set(() => ({ byId: seedChecking() }));

    const p = (async () => {
      try {
        const res = await fetch("/api/models/health?stream=1", {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`sweep failed: ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          for (;;) {
            const { event, rest } = takeHealthEvent(buffer);
            buffer = rest;
            if (!event) break;
            if (!current()) return;
            if (event.type === "start") {
              set((s) => {
                const byId = { ...s.byId };
                for (const id of event.models) {
                  byId[id] = {
                    id,
                    ok: false,
                    latencyMs: null,
                    status: "checking",
                  };
                }
                return { byId };
              });
            } else if (event.type === "result") {
              const r = event.result;
              set((s) => ({
                byId: {
                  ...s.byId,
                  [r.id]: { ...r, status: healthStatusFor(r) },
                },
              }));
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          }
        }
        if (!current()) return;
        set({
          loaded: true,
          checking: false,
          checkedAt: Date.now(),
          _inflight: null,
          _abort: null,
        });
      } catch (e) {
        if (!current()) return;
        if ((e as Error)?.name === "AbortError") {
          set({ checking: false, _inflight: null, _abort: null });
          return;
        }
        set({
          loaded: true,
          checking: false,
          error: (e as Error)?.message ?? "health check failed",
          _inflight: null,
          _abort: null,
        });
      }
    })();

    set({ _inflight: p });
    await p;
  },
}));

export function healthLabel(h: ModelHealth | undefined): string | undefined {
  return sharedHealthLabel(h);
}

export function speedLabel(h: ModelHealth | undefined): string | undefined {
  return sharedSpeedLabel(h);
}
