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

/** Per-chat usage readout (P2.4): one row per assistant generation for a chat,
 * aggregated + newest-first row list. Enables the per-chat cost/token/turn
 * display without a dashboard. `chatId` here is the CLIENT chat UUID (what the
 * route thread through usageLog.chatId). Internal surface — admin client only. */
export const USAGE_ROWS_CAP = 200;

type UsageRow = {
  model: string;
  ts: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs?: number;
  estimatedCostUsd?: number;
};

export const listForChat = internalQuery({
  args: { userId: v.string(), chatId: v.string() },
  returns: v.object({
    count: v.number(),
    totalTokens: v.number(),
    totalInputTokens: v.number(),
    totalOutputTokens: v.number(),
    totalDurationMs: v.number(),
    estimatedCostUsd: v.number(),
    rows: v.array(
      v.object({
        model: v.string(),
        ts: v.number(),
        inputTokens: v.number(),
        outputTokens: v.number(),
        totalTokens: v.number(),
        durationMs: v.optional(v.number()),
        estimatedCostUsd: v.optional(v.number()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("usageLog")
      .withIndex("by_user_ts", (q) => q.eq("userId", args.userId))
      .collect();
    return rows
      .filter((r) => r.chatId === args.chatId)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, USAGE_ROWS_CAP)
      .reduce(
        (acc, r) => {
          acc.count += 1;
          acc.totalTokens += r.totalTokens ?? 0;
          acc.totalInputTokens += r.inputTokens ?? 0;
          acc.totalOutputTokens += r.outputTokens ?? 0;
          acc.totalDurationMs += r.durationMs ?? 0;
          acc.estimatedCostUsd += r.estimatedCostUsd ?? 0;
          acc.rows.push({
            model: r.model ?? "",
            ts: r.ts ?? 0,
            inputTokens: r.inputTokens ?? 0,
            outputTokens: r.outputTokens ?? 0,
            totalTokens: r.totalTokens ?? 0,
            ...(r.durationMs != null ? { durationMs: r.durationMs } : {}),
            ...(r.estimatedCostUsd != null ? { estimatedCostUsd: r.estimatedCostUsd } : {}),
          });
          return acc;
        },
        {
          count: 0,
          totalTokens: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalDurationMs: 0,
          estimatedCostUsd: 0,
          rows: [] as UsageRow[],
        },
      );
  },
});