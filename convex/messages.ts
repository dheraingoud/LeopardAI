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
    userId: v.string(), // Added mandatory userId check
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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
