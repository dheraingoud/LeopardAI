import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Φ3 NEW — artifact documents (mirrors vercel-chatbot document table).
// Versioned: multiple rows share logical `id`, differ by createdAt. Latest =
// highest createdAt. Kinds: text (ProseMirror) / code (CodeMirror) /
// sheet (react-data-grid) / image (inline). Wired in Phase 6.

export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documents")
      .withIndex("by_public_id", (q) => q.eq("id", args.id))
      .order("desc")
      .collect();
  },
});

export const getLatest = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    return (
      (await ctx.db
        .query("documents")
        .withIndex("by_public_id", (q) => q.eq("id", args.id))
        .order("desc")
        .first()) ?? null
    );
  },
});

export const save = mutation({
  args: {
    id: v.string(),
    title: v.string(),
    kind: v.union(
      v.literal("text"),
      v.literal("code"),
      v.literal("image"),
      v.literal("sheet")
    ),
    content: v.optional(v.string()),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("documents", {
      id: args.id,
      title: args.title,
      kind: args.kind,
      content: args.content,
      userId: args.userId,
      createdAt: Date.now(),
    });
  },
});

export const updateContent = mutation({
  args: {
    id: v.string(),
    createdAt: v.number(),
    content: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("documents")
      .withIndex("by_public_id", (q) => q.eq("id", args.id))
      .filter((q) => q.eq(q.field("createdAt"), args.createdAt))
      .first();
    if (!doc) throw new Error("Document version not found");
    if (doc.userId !== args.userId) throw new Error("Unauthorized");
    await ctx.db.patch(doc._id, { content: args.content });
  },
});

// Φ3 NEW: delete versions at-or-after a timestamp (mirrors vercel-chatbot
// deleteDocumentsByIdAfterTimestamp — used when an artifact edit is reverted).
export const deleteAfterTimestamp = mutation({
  args: { id: v.string(), timestamp: v.number(), userId: v.string() },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_public_id", (q) => q.eq("id", args.id))
      .filter((q) => q.gte(q.field("createdAt"), args.timestamp))
      .collect();
    for (const doc of docs) {
      if (doc.userId !== args.userId) continue;
      await ctx.db.delete(doc._id);
    }
  },
});
