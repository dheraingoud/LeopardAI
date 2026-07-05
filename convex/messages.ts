import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .order("asc")
      .collect();
  },
});

export const send = mutation({
  args: {
    chatId: v.id("chats"),
    userId: v.string(),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      // SECURITY: Ensure chat ownership
      const chat = await ctx.db.get(args.chatId);
      if (!chat || chat.userId !== args.userId) {
        throw new Error("Unauthorized: You do not own this chat");
      }

      return await ctx.db.insert("messages", {
        chatId: args.chatId,
        role: args.role,
        content: args.content,
        model: args.model,
        createdAt: Date.now(),
      });
    } catch (error) {
      // Log error for debugging but don't expose internal details
      console.error("[messages:send] error:", error);
      // Re-throw user-safe error
      if (error instanceof Error && error.message.includes("Unauthorized")) {
        throw error;
      }
      throw new Error("Failed to send message. Please try again.");
    }
  },
});

export const update = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      content: args.content,
    });
  },
});

export const remove = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.messageId);
  },
});

export const storeSummary = mutation({
  args: {
    chatId: v.id("chats"),
    startMessageIndex: v.number(),
    endMessageIndex: v.number(),
    summary: v.string(),
    tokenCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("summaries", {
      chatId: args.chatId,
      startMessageIndex: args.startMessageIndex,
      endMessageIndex: args.endMessageIndex,
      summary: args.summary,
      tokenCount: args.tokenCount,
      createdAt: Date.now(),
    });
  },
});

export const getSummaries = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("summaries")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .collect();
  },
});
