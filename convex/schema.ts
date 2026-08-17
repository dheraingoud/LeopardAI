import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ═══════════════════════════════════════════════════════════════════════
// Φ3 — Transitional schema (vercel-chatbot adaptation, Convex-native).
//
// New fields (parts / id / memory / votes / documents) are OPTIONAL here so
// existing rows validate against this schema IMMEDIATELY — the idempotent
// migration `migrations:stringContentToParts` backfills them. Tightening to
// `parts` is preferred; `content` stays optional (legacy readers). type /
// workspaceId kept OPTIONAL on chats — a stale "SQL Viz" test row (id j571…)
// still carries `type:"sql"`; dropping the fields = destructive backfill.
// Kept optional instead — permanent minor tech-debt. New writers never set them.
//
// Tables: users(+memory) · chats(+id, legacy type/workspaceId optional) ·
// messages(+id, +parts, +attachments, content optional legacy) ·
// votes(NEW) · documents(NEW artifacts) · summaries. schemaSessions DROPPED
// (docs deleted by migration before this schema is pushed).
// ═══════════════════════════════════════════════════════════════════════

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    imageUrl: v.optional(v.string()),
    defaultModel: v.optional(v.string()),
    // Φ3: lightweight cross-chat memory blob (plan H). Backfilled "" by migration.
    memory: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_clerk_id", ["clerkId"]),

  chats: defineTable({
    userId: v.string(),
    title: v.string(),
    model: v.string(),
    // Φ3: client UUID (vercel-chatbot chat.id for deferred-create flow).
    // Backfilled to _id.toString() by migration.
    id: v.optional(v.string()),
    shared: v.boolean(), // visibility: shared=true ↔ "public"
    shareId: v.optional(v.string()),
    // LEGACY optional — schema-viz era. Kept optional so the stale "SQL Viz"
    // test row (id j571…) still validates; new createChat (P9) never sets them.
    // Permanent minor tech-debt (dropping needs a destructive backfill). ⤵ Φ9
    workspaceId: v.optional(v.string()),
    type: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_share_id", ["shareId"])
    .index("by_public_id", ["id"]),

  messages: defineTable({
    chatId: v.id("chats"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    // Φ3: AI SDK v6 UIMessage parts. Source of truth post-migration.
    parts: v.optional(v.array(v.any())),
    // LEGACY plain-text content. Interim chat path still writes this until
    // Phase 5 swaps writers to parts. Read path prefers `parts` when present.
    content: v.optional(v.string()),
    attachments: v.optional(v.array(v.any())),
    // Φ3: client UUID (UIMessage.id). Backfilled to _id by migration.
    id: v.optional(v.string()),
    model: v.optional(v.string()),
    // Φ10: server-owned generation lifecycle. Rows written by the detached
    // /api/chat background task are `streaming` until they complete, then
    // flipped to `completed`. Client-persisted rows (user msgs) leave it unset
    // — `undefined` reads as "settled". Lets a reloaded page distinguish an
    // in-flight reply (re-render as it fills) from a finished one.
    status: v.optional(
      v.union(v.literal("streaming"), v.literal("completed"))
    ),
    createdAt: v.number(),
  })
    .index("by_chat", ["chatId"])
    // Φ9: composite index — replaces the unbounded `.filter(q.gte(createdAt))`
    // scan in messages.deleteAfterTimestamp.
    .index("by_chat_createdAt", ["chatId", "createdAt"])
    // m7 (review): composite index scoping the upsertAssistant id lookup to a
    // single chat, so a colliding client id in a different chat can never fold
    // into an unrelated row.
    .index("by_chat_public_id", ["chatId", "id"])
    .index("by_public_id", ["id"]),

  // Φ3 NEW — message votes (thumbs up/down). One vote per message.
  votes: defineTable({
    chatId: v.id("chats"),
    messageId: v.string(), // matches messages.id (client UUID)
    isUpvoted: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_chat", ["chatId"]),

  // Φ3 NEW — artifact documents. Versioned: multiple rows share `id`, differ
  // by createdAt (mirrors vercel-chatbot document table).
  documents: defineTable({
    id: v.string(), // artifact logical id (client UUID)
    title: v.string(),
    kind: v.union(
      v.literal("text"),
      v.literal("code"),
      v.literal("image"),
      v.literal("sheet")
    ),
    content: v.optional(v.string()),
    userId: v.string(),
    createdAt: v.number(),
  })
    .index("by_public_id", ["id"])
    // Φ9: composite index — replaces the unbounded `.filter(q.gte(createdAt))`
    // scan in documents.deleteAfterTimestamp / updateContent.
    .index("by_id_createdAt", ["id", "createdAt"])
    .index("by_user", ["userId"]),

  summaries: defineTable({
    chatId: v.id("chats"),
    startMessageIndex: v.number(),
    endMessageIndex: v.number(),
    summary: v.string(),
    tokenCount: v.number(),
    createdAt: v.number(),
  }).index("by_chat", ["chatId"]),
});
