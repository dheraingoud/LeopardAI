import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireChatOwner } from "./_auth";

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

// Φ3 NEW: fetch by client UUID `id` (vercel-chatbot port routes chats by id).
export const getById = query({
  args: { id: v.string(), userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_public_id", (q) => q.eq("id", args.id))
      .first();
    if (!chat) return null;
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
    // Φ3: client UUID for deferred-create flow (vercel-chatbot pattern).
    id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("chats", {
      userId: args.userId,
      title: args.title,
      model: args.model,
      id: args.id ?? nanoid(),
      shared: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateTitle = mutation({
  args: { chatId: v.id("chats"), userId: v.string(), title: v.string() },
  handler: async (ctx, args) => {
    await requireChatOwner(ctx, args.chatId, args.userId);  // "Unauthorized or not found"
    await ctx.db.patch(args.chatId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { chatId: v.id("chats"), userId: v.string() },
  handler: async (ctx, args) => {
    await requireChatOwner(ctx, args.chatId, args.userId);  // "Unauthorized or not found"

    // Delete all messages in the chat
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    // Φ3: cascade-delete votes for this chat
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .collect();
    for (const voteDoc of votes) {
      await ctx.db.delete(voteDoc._id);
    }

    await ctx.db.delete(args.chatId);
  },
});

export const share = mutation({
  args: { chatId: v.id("chats"), userId: v.string() },
  handler: async (ctx, args) => {
    await requireChatOwner(ctx, args.chatId, args.userId);  // "Unauthorized or not found"

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
    await requireChatOwner(ctx, args.chatId, args.userId);  // "Unauthorized or not found"

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
    await requireChatOwner(ctx, args.chatId, args.userId);  // "Unauthorized or not found"

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

/**
 * One-shot cleanup: delete a user's chats that have ZERO messages (the old
 * eager-create flow minted an empty "New Chat" row on every /chat visit).
 * Safe to keep around — deletes nothing once the deferred-create flow has
 * been the only writer for a while.
 */
export const purgeEmpty = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const mine = await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    let removed = 0;
    for (const chat of mine) {
      const first = await ctx.db
        .query("messages")
        .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
        .first();
      if (!first) {
        await ctx.db.delete(chat._id);
        removed++;
      }
    }
    return { removed };
  },
});
