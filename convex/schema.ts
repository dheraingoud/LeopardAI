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

  // Φ-docs · enterprise cost observability — one row per assistant generation,
  // written by the detached /api/chat task from streamText's real result.usage.
  // Drives the per-user daily token cap (sumTokensSince) + spend dashboards.
  usageLog: defineTable({
    chatId: v.id("chats"),
    userId: v.string(),
    model: v.string(),
    provider: v.optional(v.string()),
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
    durationMs: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
    ts: v.number(),
  })
    .index("by_user_ts", ["userId", "ts"])
    .index("by_chat", ["chatId"]),

  // Φ-docs · per-user long-term memory (recall loop). One row per recalled fact.
  // Route injects these into the system prompt (LEOPARD_MEMORY=1); a memory
  // tool can add/remove them mid-conversation; the UI affordance lists the
  // count and lets the user delete. Pinned facts float to the top. Index by
  // user + recency so recall pulls newest-first (pinned first).
  userMemory: defineTable({
    userId: v.string(),
    text: v.string(), // the fact, as the model/memory tool stored it
    pinned: v.optional(v.boolean()),
    sourceChatId: v.optional(v.id("chats")),
    // Φ-semantic (LEOPARD_SEMANTIC_MEMORY): the fact's NIM embedding as a plain
    // float array — brute-force cosine over it at recall, no vector DB. All
    // three optional so rows written before / without semantic recall still
    // validate (and the model swap guard stays cheap).
    embedding: v.optional(v.array(v.number())),
    embedModel: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_updatedAt", ["userId", "updatedAt"])
    .index("by_user", ["userId"]),

  // Φ-docs · enterprise tool audit trail — append-only log of every gate
  // decision + tool execution the model runs. Written via internal.audit.record
  // (internalMutation; no public client surface). Immutable: insert-only.
  toolAuditLog: defineTable({
    assistantId: v.string(),
    chatId: v.id("chats"),
    userId: v.string(),
    event: v.union(
      v.literal("approval"),
      v.literal("tool-execution"),
      v.literal("tool-error"),
    ),
    toolName: v.string(),
    decision: v.optional(v.string()),
    reason: v.optional(v.string()),
    inputJson: v.optional(v.string()),
    outputSummary: v.optional(v.string()),
    ts: v.number(),
  })
    .index("by_user_ts", ["userId", "ts"])
    .index("by_chat_ts", ["chatId", "ts"])
    .index("by_assistant", ["assistantId"]),
});
