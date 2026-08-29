// Φ-docs · retention sweep — port of claude-code `cleanupPeriodDays`.
//
// The CLI deletes session transcripts older than the configured retention
// period (default 30d, gated by `cleanupPeriodDays`). Leopard's sessions live
// in Convex, so this is the equivalent: a periodic sweep that deletes chat
// sessions (and their messages / votes / summaries / usage rows) once they're
// older than `LEOPARD_RETENTION_DAYS` days.
//
// FAIL-CLOSED: deletion only happens when the operator sets the numeric
// environment variable `LEOPARD_RETENTION_DAYS` to a positive integer in the
// Convex dashboard. If it is unset, invalid, or non-positive, `sweep` is a
// no-op dry run — it reports `{ dryRun: true }` and deletes nothing. The daily
// cron registered in `crons.ts` calls `sweep`, so arming the env var is the
// single switch that turns the sweep on; until then the cron is harmless.

import { mutation, query, type MutationCtx } from "./_generated/server";
import { type Id } from "./_generated/dataModel";
import { v } from "convex/values";

const DAY_MS = 86_400_000;
// Per-invocation cap on rows removed, so a huge backlog drains across several
// runs without one call loading the whole table into memory.
const BATCH = 500;

/** The operator-configured retention window in whole days, or 0 when unset /
 *  invalid. 0 = fail-closed: the sweep is a dry run and deletes nothing. */
export function retentionDays(): number {
  const raw = process.env.LEOPARD_RETENTION_DAYS;
  if (!raw) return 0;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Delete one chat and every row that references it. Child-first so no orphan
 *  rows survive; index lookups keep the cascade O(rows-in-chat). */
async function deleteChatCascade(ctx: MutationCtx, chatId: Id<"chats">): Promise<void> {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_chat", (q) => q.eq("chatId", chatId))
    .collect();
  for (const m of messages) await ctx.db.delete(m._id);

  const votes = await ctx.db
    .query("votes")
    .withIndex("by_chat", (q) => q.eq("chatId", chatId))
    .collect();
  for (const vt of votes) await ctx.db.delete(vt._id);

  const summaries = await ctx.db
    .query("summaries")
    .withIndex("by_chat", (q) => q.eq("chatId", chatId))
    .collect();
  for (const s of summaries) await ctx.db.delete(s._id);

  const usage = await ctx.db
    .query("usageLog")
    .withIndex("by_chat", (q) => q.eq("chatId", chatId))
    .collect();
  for (const u of usage) await ctx.db.delete(u._id);

  await ctx.db.delete(chatId);
}

export const sweepReturnSchema = v.object({
  dryRun: v.boolean(),
  days: v.number(),
  deleted: v.number(),
  scanned: v.number(),
});

/** Run the retention sweep. Dry-run (deletes nothing) unless `LEOPARD_RETENTION_DAYS`
 *  is a positive integer. No auth requirement: destructive power is gated by the
 *  operator env var, not by who calls it, so the cron and `convex run` both behave. */
export const sweep = mutation({
  args: {},
  returns: sweepReturnSchema,
  handler: async (ctx) => {
    const days = retentionDays();
    if (days <= 0) return { dryRun: true, days: 0, deleted: 0, scanned: 0 };

    const cutoff = Date.now() - days * DAY_MS;
    let deleted = 0;
    let scanned = 0;
    // Drain oldest-first in bounded batches so a large backlog completes across
    // several runs without a single call reading the whole table.
    while (deleted < BATCH) {
      const batch = await ctx.db
        .query("chats")
        .withIndex("by_created_at", (q) => q.lt("createdAt", cutoff))
        .order("asc")
        .take(BATCH - deleted);
      if (batch.length === 0) break;
      scanned += batch.length;
      for (const c of batch) {
        await deleteChatCascade(ctx, c._id);
        deleted++;
      }
    }
    return { dryRun: false, days, deleted, scanned };
  },
});

/** Public read of the retention-cron armed state, for the settings ScheduleCard.
 *  0 days = fail-closed dry run (the cron runs daily but deletes nothing). */
export const status = query({
  args: {},
  returns: v.object({ days: v.number() }),
  handler: async () => ({ days: retentionDays() }),
});