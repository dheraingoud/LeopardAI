import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireChatOwner } from "./_auth";


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

// Φ3 NEW: fetch a single message by client UUID (UIMessage.id).
export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const msg = await ctx.db
      .query("messages")
      .withIndex("by_public_id", (q) => q.eq("id", args.id))
      .first();
    return msg ?? null;
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
    // LEGACY plain-text content (interim chat path still uses this).
    content: v.optional(v.string()),
    // Φ3: AI SDK v6 UIMessage parts (preferred writers).
    parts: v.optional(v.array(v.any())),
    attachments: v.optional(v.array(v.any())),
    // Φ3: client UUID (UIMessage.id).
    id: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      // SECURITY: Ensure chat ownership
      await requireChatOwner(ctx, args.chatId, args.userId);  // "Unauthorized: You do not own this chat"

      if (!args.content && !args.parts) {
        throw new Error("Message requires either content or parts");
      }

      return await ctx.db.insert("messages", {
        id: args.id,
        chatId: args.chatId,
        role: args.role,
        content: args.content,
        parts: args.parts,
        attachments: args.attachments,
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
    userId: v.string(),
    content: v.optional(v.string()),
    parts: v.optional(v.array(v.any())),
    attachments: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    // SECURITY: gate - fetch target message
    const m = await ctx.db.get(args.messageId);
    if (!m) throw new Error("Not found");
    // SECURITY: gate - confirm ownership via parent chat
    const c = await ctx.db.get(m.chatId);
    if (!c || c.userId !== args.userId) throw new Error("Unauthorized");
    const patch: Record<string, unknown> = {};
    if (args.content !== undefined) patch.content = args.content;
    if (args.parts !== undefined) {
      patch.parts = args.parts;
      // Φ3: parts is now source of truth — clear legacy content.
      patch.content = undefined;
    }
    if (args.attachments !== undefined) patch.attachments = args.attachments;
    await ctx.db.patch(args.messageId, patch);
  },
});

export const remove = mutation({
  args: { messageId: v.id("messages"), userId: v.string() },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg) throw new Error("Not found");
    const chat = await ctx.db.get(msg.chatId);
    if (!chat || chat.userId !== args.userId) throw new Error("Unauthorized");
    if (msg.id) {
      const votes = await ctx.db
        .query("votes")
        .withIndex("by_message", (q) => q.eq("messageId", msg.id as string))
        .collect();
      for (const vt of votes) await ctx.db.delete(vt._id);
    }
    await ctx.db.delete(args.messageId);
  },
});

// Φ3 NEW: delete messages in a chat at-or-after a timestamp (edit/regenerate
// support, mirrors vercel-chatbot deleteMessagesByChatIdAfterTimestamp).
export const deleteAfterTimestamp = mutation({
  args: {
    chatId: v.id("chats"),
    timestamp: v.number(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireChatOwner(ctx, args.chatId, args.userId);  // "Unauthorized or not found"
    // Φ9: composite by_chat_createdAt index replaces the unbounded
    // `.filter(q.gte(createdAt))` table scan.
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat_createdAt", (q) =>
        q.eq("chatId", args.chatId).gte("createdAt", args.timestamp)
      )
      .collect();
    for (const msg of messages) {
      // Cascade-delete votes keyed on this message's client id.
      if (msg.id) {
        const votes = await ctx.db
          .query("votes")
          .withIndex("by_message", (q) => q.eq("messageId", msg.id as string))
          .collect();
        for (const v of votes) await ctx.db.delete(v._id);
      }
      await ctx.db.delete(msg._id);
    }
  },
});

export const storeSummary = mutation({
  args: {
    chatId: v.id("chats"),
    startMessageIndex: v.number(),
    endMessageIndex: v.number(),
    summary: v.string(),
    tokenCount: v.number(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== args.userId) throw new Error("Unauthorized");
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
