import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { nanoid } from "nanoid";

export const list = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { chatId: v.id("chats"), userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat) return null;
    
    // If not shared and userId doesn't match, deny (if userId provided)
    if (!chat.shared && args.userId && chat.userId !== args.userId) {
      return null;
    }
    return chat;
  },
});

export const getByShareId = query({
  args: { shareId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chats")
      .withIndex("by_share_id", (q) => q.eq("shareId", args.shareId))
      .first();
  },
});

export const create = mutation({
  args: {
    userId: v.string(),
    title: v.string(),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("chats", {
      userId: args.userId,
      title: args.title,
      model: args.model,
      shared: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateTitle = mutation({
  args: { chatId: v.id("chats"), userId: v.string(), title: v.string() },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== args.userId) {
      throw new Error("Unauthorized or not found");
    }
    await ctx.db.patch(args.chatId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { chatId: v.id("chats"), userId: v.string() },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== args.userId) {
      throw new Error("Unauthorized or not found");
    }

    // Delete all messages in the chat
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }
    await ctx.db.delete(args.chatId);
  },
});

export const share = mutation({
  args: { chatId: v.id("chats"), userId: v.string() },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== args.userId) {
      throw new Error("Unauthorized or not found");
    }
    
    const shareId = nanoid(12);
    await ctx.db.patch(args.chatId, {
      shared: true,
      shareId,
      updatedAt: Date.now(),
    });
    return shareId;
  },
});

export const unshare = mutation({
  args: { chatId: v.id("chats"), userId: v.string() },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== args.userId) {
      throw new Error("Unauthorized or not found");
    }

    await ctx.db.patch(args.chatId, {
      shared: false,
      shareId: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const updateModel = mutation({
  args: { chatId: v.id("chats"), userId: v.string(), model: v.string() },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== args.userId) {
      throw new Error("Unauthorized or not found");
    }

    await ctx.db.patch(args.chatId, {
      model: args.model,
      updatedAt: Date.now(),
    });
  },
});

export const touch = mutation({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.chatId, { updatedAt: Date.now() });
  },
});
