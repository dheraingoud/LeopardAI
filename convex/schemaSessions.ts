import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByChat = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("schemaSessions")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .first();
  },
});

export const save = mutation({
  args: {
    chatId: v.id("chats"),
    workspaceData: v.string(), // The stringified array of workspaces or a single workspace
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("schemaSessions")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        workspaceData: args.workspaceData,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("schemaSessions", {
        chatId: args.chatId,
        workspaceData: args.workspaceData,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});
