// ═══════════════════════════════════════════════════════════════════════════
// Φ-docs · per-user long-term memory (recall loop).
//
// The chat model gains durable facts about the user across conversations:
//   - ROUTE injects a user's facts into the system prompt at turn start
//     (lib/ai/memory.ts reads via the internal query here), so every reply can
//     honor stated preferences, identity, and standing facts.
//   - A `memory_*` model tool (routes through the same internal mutations)
//     lets the model remember a new fact or forget one mid-conversation.
//   - The UI affordance (components/chat/memory-badge.tsx) shows the count and
//     lists facts with one-click delete via the public query/mutation below.
//
// Ownership: userId is the trust boundary the ROUTE passes (its verified Clerk
// subject / dev bypass), consistent with messages/audit. The public
// listMine/forget take an explicit userId from the signed-in client and filter
/// by it — no admin key exposed, no chat to own.
// ═══════════════════════════════════════════════════════════════════════════

import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

/** Deterministic dedupe key: lowercase, trimmed, whitespace-collapsed. */
export function normalizeMemoryKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/\s+([.,!?;:])/g, "$1");
}

function orderMemories(rows: Doc<"userMemory">[]): Doc<"userMemory">[] {
  return [...rows].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

// ── Public (client) surface ─────────────────────────────────────────────────

/** All memories for a user (pinned first, newest first). Caller passes its
 * signed-in userId; rows are returned caller-provided-arg scoped. */
export const listMine = query({
  args: { userId: v.optional(v.string()) },
  returns: v.array(
    v.object({
      _id: v.id("userMemory"),
      text: v.string(),
      pinned: v.optional(v.boolean()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    if (!args.userId) return [];
    const rows = await ctx.db
      .query("userMemory")
      .withIndex("by_user", (q) => q.eq("userId", args.userId!))
      .collect();
    return orderMemories(rows).map(({ _id, text, pinned, createdAt, updatedAt }) => ({
      _id,
      text,
      pinned,
      createdAt,
      updatedAt,
    }));
  },
});

/** Count (for the compose-area badge). */
export const countMine = query({
  args: { userId: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (!args.userId) return 0;
    const rows = await ctx.db
      .query("userMemory")
      .withIndex("by_user", (q) => q.eq("userId", args.userId!))
      .collect();
    return rows.length;
  },
});

/** Delete one memory the signed-in user owns. */
export const forget = mutation({
  args: { memoryId: v.id("userMemory"), userId: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (!args.userId) return false;
    const row = await ctx.db.get(args.memoryId);
    if (!row || row.userId !== args.userId) return false;
    await ctx.db.delete(row._id);
    return true;
  },
});

// ── Internal (route / model tool) surface — admin client, route is the ↵
// trust boundary ──────────────────────────────────────────────────────────────

/** Ordered recall list for the route to inject into the system prompt. */
export const listForUser = internalQuery({
  args: { userId: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("userMemory"),
      text: v.string(),
      pinned: v.optional(v.boolean()),
      updatedAt: v.number(),
      embedding: v.optional(v.array(v.number())),
      embedModel: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("userMemory")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return orderMemories(rows).map(({ _id, text, pinned, updatedAt, embedding, embedModel }) => ({
      _id,
      text,
      pinned,
      updatedAt,
      ...(embedding && Array.isArray(embedding) && embedding.length
        ? { embedding }
        : {}),
      ...(embedModel ? { embedModel } : {}),
    }));
  },
});

/** Remember a fact — dedupes on the normalized text. Returns the new/updated
 * row id count so the tool can report how many memories exist. */
export const remember = internalMutation({
  args: {
    userId: v.string(),
    text: v.string(),
    pinned: v.optional(v.boolean()),
    sourceChatId: v.optional(v.id("chats")),
    embedding: v.optional(v.array(v.number())),
    embedModel: v.optional(v.string()),
  },
  returns: v.number(), // total memories after this write
  handler: async (ctx, args) => {
    const key = normalizeMemoryKey(args.text);
    const all = await ctx.db.query("userMemory").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect();
    if (!key) return all.length;
    const existing = all.find((m) => normalizeMemoryKey(m.text) === key);
    const now = Date.now();
    const embedFields = {
      ...(args.embedding && Array.isArray(args.embedding) && args.embedding.length
        ? { embedding: args.embedding }
        : {}),
      ...(args.embedModel ? { embedModel: args.embedModel } : {}),
    };
    if (existing) {
      await ctx.db.patch(existing._id, {
        text: args.text,
        pinned: args.pinned ?? existing.pinned,
        ...(args.sourceChatId ? { sourceChatId: args.sourceChatId } : {}),
        ...embedFields,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userMemory", {
        userId: args.userId,
        text: args.text,
        pinned: args.pinned,
        ...(args.sourceChatId ? { sourceChatId: args.sourceChatId } : {}),
        ...embedFields,
        createdAt: now,
        updatedAt: now,
      });
    }
    const total = await ctx.db.query("userMemory").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect();
    return total.length;
  },
});

/** Forget a specific memory by id. */
export const forgetById = internalMutation({
  args: { userId: v.string(), memoryId: v.id("userMemory") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.memoryId);
    if (!row || row.userId !== args.userId) return false;
    await ctx.db.delete(row._id);
    return true;
  },
});