import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireChatOwner } from "./_auth";


// Φ3 NEW — message votes (mirrors vercel-chatbot Vote_v2). One vote per
// message (single-user app; upsert keyed by messageId).

export const getByChat = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("votes")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .collect();
  },
});

export const get = query({
  args: { messageId: v.string() },
  handler: async (ctx, args) => {
    return (
      (await ctx.db
        .query("votes")
        .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
        .first()) ?? null
    );
  },
});

export const vote = mutation({
  args: {
    chatId: v.id("chats"),
    messageId: v.string(),
    isUpvoted: v.boolean(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireChatOwner(ctx, args.chatId, args.userId);  // "Unauthorized or not found"

    const existing = await ctx.db
      .query("votes")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { isUpvoted: args.isUpvoted });
      return existing._id;
    }

    return await ctx.db.insert("votes", {
      chatId: args.chatId,
      messageId: args.messageId,
      isUpvoted: args.isUpvoted,
      createdAt: Date.now(),
    });
  },
});
