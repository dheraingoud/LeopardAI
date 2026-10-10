import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
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

// Φ10: server-owned assistant persistence (#3 background generation).
//
// The /api/chat route now owns the assistant reply end-to-end so a browser
// reload/exit doesn't lose it. This mutation is the server's write primitive,
// called with `adminAuth` by a ConvexHttpClient in the route — Convex's own
// auth is bypassed, so the route (the Clerk trust boundary) is what asserts the
// real owner. Ownership is enforced here by DATA: requireChatOwner compares the
// userId the ROUTE passed (its verified Clerk subject / dev bypass) against the
// chat's stored userId. Safe: only a route that already passed Clerk auth can
// name a userId, and Convex refuses if that user doesn't own the chat.
//
// Create-or-patch by the message's client id (UIMessage.id) — a streaming row
// is inserted at generation start (parts:[], status:"streaming"), progressively
// patched as parts accumulate, and patched final on completion. The debounced
// writer is idempotent: repeated patches of the same id converge on one row,
// so a stray double-fire can't create duplicates.
export const upsertAssistant = internalMutation({
  args: {
    chatId: v.id("chats"),
    userId: v.string(),
    id: v.string(),
    model: v.optional(v.string()),
    parts: v.array(v.any()),
    status: v.optional(
      v.union(v.literal("streaming"), v.literal("completed"))
    ),
  },
  returns: v.object({
    _id: v.id("messages"),
    id: v.string(),
    createdAt: v.optional(v.number()),
    updated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireChatOwner(ctx, args.chatId, args.userId); // "Unauthorized or not found"

    // m7 (review): scope the existence lookup by BOTH chatId and client id via
    // the composite `by_chat_public_id` index, so a colliding id in a different
    // chat can never mutate an unrelated row.
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_chat_public_id", (q) =>
        q.eq("chatId", args.chatId).eq("id", args.id)
      )
      .first();

    if (existing) {
      const patch: Record<string, unknown> = {
        parts: args.parts,
        role: "assistant", // exact-match the inserted shape so the row stays uniform
      };
      if (args.status !== undefined) patch.status = args.status;
      if (args.model !== undefined) patch.model = args.model;
      await ctx.db.patch(existing._id, patch);
      // Sidebar freshness (audit 2026-10-08): text turns never touched the chat
      // row's updatedAt, so list ordering + unread went stale mid-conversation.
      // Throttle to completed/streaming-flip patches (not every debounced
      // streaming patch) to keep write volume flat.
      // Sidebar "generating" blink (2026-09-04): mirror the lifecycle onto the
      // chat row so the list shows a live dot without a per-chat query.
      if (args.status !== undefined) {
        await ctx.db.patch(args.chatId, {
          generating: args.status === "streaming",
          updatedAt: Date.now(),
        });
      }
      return { _id: existing._id, id: args.id, createdAt: existing.createdAt, updated: true };
    }

    const inserted = await ctx.db.insert("messages", {
      id: args.id,
      chatId: args.chatId,
      role: "assistant",
      parts: args.parts,
      ...(args.model !== undefined ? { model: args.model } : {}),
      ...(args.status !== undefined ? { status: args.status } : {}),
      createdAt: Date.now(),
    });
    if (args.status !== undefined) {
      await ctx.db.patch(args.chatId, {
        generating: args.status === "streaming",
        updatedAt: Date.now(),
      });
    }
    return { _id: inserted, id: args.id, createdAt: undefined, updated: false };
  },
});

// Stuck-stop fix (2026-09-05): a detached generation that dies without its
// final patch (lambda recycled, route restart, stop POST landing on a
// different serverless instance than the one holding the abort registry)
// leaves its row status:"streaming" FOREVER — the composer's serverStreaming
// stays true and the send/stop button locks in the stop state with clicks
// that do nothing. This mutation settles such a row (streaming → completed,
// clears the sidebar generating flag). Idempotent: a live generation's final
// patch writes the same value; a settled row is a no-op.
export const settleStreaming = mutation({
  args: { messageId: v.id("messages"), userId: v.string() },
  returns: v.object({ settled: v.boolean() }),
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg) throw new Error("Not found");
    const chat = await ctx.db.get(msg.chatId);
    if (!chat || chat.userId !== args.userId) throw new Error("Unauthorized");
    if (msg.status !== "streaming") return { settled: false };
    // Approval-pause burial (2026-10-10): a settled row must never carry a
    // still-pending approval-requested tool part — the client's ApprovalDock
    // scans that state and would resurrect the Allow/Deny card on a DEAD turn
    // (live repro: the Instagram-CDN chat settled by the 90s stuck-stop reaper
    // while webFetch awaited a decision; the card vanished, the part flipped to
    // the INTERRUPTED chip, and the turn showed "Working" forever with no LLM
    // running). A settled turn means the prompt is dead — flip the orphan to a
    // terminal state.
    const parts = (msg.parts ?? []).map((p) =>
      p && (p as { state?: string }).state === "approval-requested"
        ? { ...(p as object), state: "interrupted" }
        : p,
    );
    await ctx.db.patch(args.messageId, { status: "completed", parts });
    await ctx.db.patch(msg.chatId, { generating: false });
    return { settled: true };
  },
});

// Orphan-approval hygiene sweep (2026-10-10): rows that settled BEFORE the
// settleStreaming burial existed carry approval-requested parts on completed
// turns (the Instagram-CDN zombie). One-off/insurance sweep — flips any
// approval-requested part on a NON-streaming row to "interrupted" so the
// client renders it as nothing (never a resurrected Allow/Deny card).
export const buryOrphanApprovals = internalMutation({
  args: { chatId: v.id("chats") },
  returns: v.object({ swept: v.number() }),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .collect();
    let swept = 0;
    for (const row of rows) {
      if (row.status === "streaming") continue; // live decision — hands off
      const parts = row.parts ?? [];
      if (!parts.some((p) => (p as { state?: string })?.state === "approval-requested"))
        continue;
      await ctx.db.patch(row._id, {
        parts: parts.map((p) =>
          p && (p as { state?: string }).state === "approval-requested"
            ? { ...(p as object), state: "interrupted" }
            : p,
        ),
      });
      swept += 1;
    }
    return { swept };
  },
});

// Stop-before-first-token cleanup (2026-09-06): an aborted generation whose
// accumulator holds NOTHING would otherwise persist a permanent empty
// assistant row (bare bubble in the chat forever). Delete the placeholder
// instead; refuse if any content landed (safety — never eats real text).
export const deleteEmptyAssistant = internalMutation({
  args: { chatId: v.id("chats"), userId: v.string(), id: v.string() },
  returns: v.object({ deleted: v.boolean() }),
  handler: async (ctx, args) => {
    await requireChatOwner(ctx, args.chatId, args.userId);
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_chat_public_id", (q) =>
        q.eq("chatId", args.chatId).eq("id", args.id)
      )
      .first();
    if (!existing) return { deleted: false };
    const hasContent = (existing.parts ?? []).some((p) => {
      if (!p || typeof p !== "object") return false;
      const t = (p as { type?: string }).type;
      if (t === "text" || t === "reasoning")
        return (((p as { text?: string }).text ?? "").trim().length > 0);
      return true; // any non-text part counts as content
    });
    if (hasContent) return { deleted: false };
    await ctx.db.delete(existing._id);
    await ctx.db.patch(args.chatId, { generating: false });
    return { deleted: true };
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
