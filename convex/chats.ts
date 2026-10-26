import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
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

/** Paginated variant (leopard ThreadListLoadMore port 2026-10-10): the sidebar
 *  used to `.collect()` the whole chats table — 124+ dev rows and unbounded
 *  growth meant every mount re-read every row. `paginate` pages in 40-row
 *  chunks; the sidebar shows "Load more" while `status === "CanLoadMore"`.
 *  The full `list` stays for settings/export (genuinely needs all). */
export const listPage = query({
  args: {
    userId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
  returns: v.object({
    page: v.array(v.any()),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(
      v.literal("SplitRecommended"),
      v.literal("SplitRequired"),
      v.null(),
    )),
  }),
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

/**
 * Server-side title write for the detached-generation path. The route emits a
 * `data-chat-title` hint AND calls this directly (draft handoff navigates
 * mid-stream, so the client hint can die with the abandoned response). Only
 * stamps when the chat still has its placeholder title — a user rename must
 * never be clobbered by a late-arriving generated title.
 */
export const setTitleIfUntitled = mutation({
  args: { chatId: v.id("chats"), userId: v.string(), title: v.string() },
  handler: async (ctx, args) => {
    await requireChatOwner(ctx, args.chatId, args.userId);
    const chat = await ctx.db.get(args.chatId);
    const current = (chat?.title ?? "").trim();
    if (current && current !== "New Chat") return;
    await ctx.db.patch(args.chatId, {
      title: args.title,
      updatedAt: Date.now(),
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

// Pin toggle (leopard ThreadListItem pin port 2026-10-10): pinned chats sort
// above recency in the sidebar. Does NOT touch updatedAt — pinning must not
// reorder the unpinned tail or mark the chat unread.
export const setPinned = mutation({
  args: { chatId: v.id("chats"), userId: v.string(), pinned: v.boolean() },
  handler: async (ctx, args) => {
    await requireChatOwner(ctx, args.chatId, args.userId);
    await ctx.db.patch(args.chatId, { pinned: args.pinned });
  },
  returns: v.null(),
});

// Archive toggle (leopard ThreadListItem archive port 2026-10-10): archived rows
// hide from the sidebar (listPage filters) but stay in the table — unarchive
// or a direct link brings them back. Does NOT touch updatedAt.
export const setArchived = mutation({
  args: { chatId: v.id("chats"), userId: v.string(), archived: v.boolean() },
  handler: async (ctx, args) => {
    await requireChatOwner(ctx, args.chatId, args.userId);
    await ctx.db.patch(args.chatId, { archived: args.archived });
  },
  returns: v.null(),
});

// Sidebar live indicator (2026-09-04): client flips this on send / off on
// settle (dev has no CONVEX_DEPLOY_KEY so the route's upsertAssistant patch
// only runs in prod). Does NOT touch updatedAt — a status flip must not
// reorder the list or mark the chat unread.
export const setGenerating = mutation({
  args: { chatId: v.id("chats"), userId: v.string(), generating: v.boolean() },
  handler: async (ctx, args) => {
    // A deleted chat is a no-op, NOT an error: the sidebar sweeper's clear can
    // land after chats.remove deleted the row (X9.3 console noise). Wrong-owner
    // still throws via requireChatOwner below.
    const row = await ctx.db.get(args.chatId);
    if (!row) return;
    await requireChatOwner(ctx, args.chatId, args.userId);
    await ctx.db.patch(args.chatId, { generating: args.generating });
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

export const saveDraft = mutation({
  args: { chatId: v.id("chats"), userId: v.string(), draft: v.string() },
  handler: async (ctx, args) => {
    await requireChatOwner(ctx, args.chatId, args.userId);
    await ctx.db.patch(args.chatId, { draft: args.draft });
  },
  returns: v.null(),
});

export const markRead = mutation({
  args: { chatId: v.id("chats"), userId: v.string(), readAt: v.number() },
  handler: async (ctx, args) => {
    await requireChatOwner(ctx, args.chatId, args.userId);
    await ctx.db.patch(args.chatId, { readAt: args.readAt });
  },
  returns: v.null(),
});
