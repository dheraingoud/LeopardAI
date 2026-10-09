// Model health sweep (2026-10-09, operator): probing every model on every
// login cost real upstream spend and stalled the picker for minutes. The
// probe now runs HERE on a slow cadence (default every 30 min): a cron action
// calls the app's own /api/models/health (which owns the NIM key + per-model
// probe logic) and writes the results into the modelHealth table. Clients
// read the cached rows (see convex/health.ts `latest`); /api/models/health
// serves the cache when fresh and only probes live when the cache is stale.

import { internalAction, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

type ProbeResult = {
  id: string;
  ok: boolean;
  latencyMs: number | null;
  reason?: string;
  speed?: string;
};

/** Read the cached health rows (client + the Next route both read this). One
 * row per registered model — bounded by the catalogue size, but still taken
 * with an explicit cap so a pathological table can't balloon the read. */
export const latest = query({
  args: {},
  returns: v.array(
    v.object({
      modelId: v.string(),
      ok: v.boolean(),
      latencyMs: v.optional(v.number()),
      reason: v.optional(v.string()),
      speed: v.optional(v.string()),
      checkedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db.query("modelHealth").take(64);
    return rows.map((r) => ({
      modelId: r.modelId,
      ok: r.ok,
      latencyMs: r.latencyMs,
      reason: r.reason,
      speed: r.speed,
      checkedAt: r.checkedAt,
    }));
  },
});

/** Upsert one probe result (called by the Next route after a live probe). */
export const record = mutation({
  args: {
    modelId: v.string(),
    ok: v.boolean(),
    latencyMs: v.optional(v.number()),
    reason: v.optional(v.string()),
    speed: v.optional(v.string()),
    checkedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("modelHealth")
      .withIndex("by_model", (q) => q.eq("modelId", args.modelId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ok: args.ok,
        latencyMs: args.latencyMs,
        reason: args.reason,
        speed: args.speed,
        checkedAt: args.checkedAt,
      });
    } else {
      await ctx.db.insert("modelHealth", {
        modelId: args.modelId,
        ok: args.ok,
        latencyMs: args.latencyMs,
        reason: args.reason,
        speed: args.speed,
        checkedAt: args.checkedAt,
      });
    }
    return null;
  },
});

/** Cron tick: ask the Next route to run a live probe + record the results.
 * The route is the single owner of the NIM key + probe semantics — Convex
 * never sees the key. LEOPARD_APP_URL points at the deployed app; the sweep is
 * a no-op (logged) when it's unset so a bare dev deploy can't fail the cron. */
export const sweep = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const appUrl = process.env.LEOPARD_APP_URL;
    if (!appUrl) {
      console.log("[modelHealth] LEOPARD_APP_URL unset — sweep skipped");
      return null;
    }
    const secret = process.env.LEOPARD_CRON_SECRET ?? "";
    try {
      const res = await fetch(`${appUrl}/api/models/health?record=1`, {
        headers: secret ? { "x-leopard-cron": secret } : {},
      });
      if (!res.ok) {
        console.warn("[modelHealth] probe route", res.status);
        return null;
      }
      const json = (await res.json()) as { results?: ProbeResult[] };
      const checkedAt = Date.now();
      for (const r of json.results ?? []) {
        await ctx.runMutation(api.health.record, {
          modelId: r.id,
          ok: r.ok,
          latencyMs: r.latencyMs ?? undefined,
          reason: r.reason,
          speed: r.speed,
          checkedAt,
        });
      }
      console.log(`[modelHealth] recorded ${(json.results ?? []).length} results`);
    } catch (e) {
      console.warn("[modelHealth] sweep failed", (e as Error)?.message);
    }
    return null;
  },
});
