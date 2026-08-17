import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// ═══════════════════════════════════════════════════════════════════════════
// Enterprise cost observability (claude-code-docs/docs/admin-setup.md —
// "usage visibility / spend controls / programmatic reporting").
//
// The detached /api/chat background task reads the provider's REAL token usage
// from streamText's result.usage on finish and records one row per request here.
// That gives operators per-user/per-model token spend, a basis for spend caps,
// and (with a pricing table) estimated cost. `sumTokensSince` powers the daily
// per-user cap check the route runs before streaming. Internal surface only —
// admin client (route) is the only caller.
// ═══════════════════════════════════════════════════════════════════════════

export const record = internalMutation({
  args: {
    chatId: v.id("chats"),
    userId: v.string(),
    model: v.string(),
    provider: v.optional(v.string()),
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
    durationMs: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
    ts: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("usageLog", args);
  },
});

/** Total tokens for a user since `since` (ms epoch) — drives the daily cap. */
export const sumTokensSince = internalQuery({
  args: { userId: v.string(), since: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("usageLog")
      .withIndex("by_user_ts", (q) => q.eq("userId", args.userId).gte("ts", args.since))
      .collect();
    return rows.reduce((acc, r) => acc + (r.totalTokens ?? 0), 0);
  },
});