// leopard · durable per-chat context — the user's own notes for a chat plus the
// rolling summary of turns already folded away by compaction. One row per chat.
import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { requireChatOwner } from "./_auth";

const NOTES_MAX_CHARS = 8000;

const contextRow = v.object({
  notes: v.optional(v.string()),
  summary: v.optional(v.string()),
  summarizedThroughId: v.optional(v.string()),
  updatedAt: v.number(),
});

export const get = query({
  args: { chatId: v.id("chats"), userId: v.string() },
  returns: v.union(v.null(), contextRow),
  handler: async (ctx, args) => {
    await requireChatOwner(ctx, args.chatId, args.userId);
    const row = await ctx.db
      .query("chatContext")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .first();
    if (!row) return null;
    return {
      notes: row.notes,
      summary: row.summary,
      summarizedThroughId: row.summarizedThroughId,
      updatedAt: row.updatedAt,
    };
  },
});

export const saveNotes = mutation({
  args: { chatId: v.id("chats"), userId: v.string(), notes: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireChatOwner(ctx, args.chatId, args.userId);
    const notes = args.notes.trim().slice(0, NOTES_MAX_CHARS);
    const existing = await ctx.db
      .query("chatContext")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { notes, updatedAt: Date.now() });
      return;
    }
    await ctx.db.insert("chatContext", {
      chatId: args.chatId,
      notes,
      updatedAt: Date.now(),
    });
  },
});

export const getForChat = internalQuery({
  args: { chatId: v.id("chats"), userId: v.string() },
  returns: v.union(v.null(), contextRow),
  handler: async (ctx, args) => {
    await requireChatOwner(ctx, args.chatId, args.userId);
    const row = await ctx.db
      .query("chatContext")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .first();
    if (!row) return null;
    return {
      notes: row.notes,
      summary: row.summary,
      summarizedThroughId: row.summarizedThroughId,
      updatedAt: row.updatedAt,
    };
  },
});

export const upsertSummary = internalMutation({
  args: {
    chatId: v.id("chats"),
    userId: v.string(),
    summary: v.string(),
    summarizedThroughId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireChatOwner(ctx, args.chatId, args.userId);
    const existing = await ctx.db
      .query("chatContext")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .first();
    const summary = args.summary.trim();
    if (existing) {
      await ctx.db.patch(existing._id, {
        summary,
        summarizedThroughId: args.summarizedThroughId,
        updatedAt: Date.now(),
      });
      return;
    }
    await ctx.db.insert("chatContext", {
      chatId: args.chatId,
      summary,
      summarizedThroughId: args.summarizedThroughId,
      updatedAt: Date.now(),
    });
  },
});
