import { mutation } from "./_generated/server";

// One-time migration to clear old data (retained for dev/reset).
export const clearAll = mutation({
  handler: async (ctx) => {
    // Clear all tables (all tables from schema — testing-phase reset)
    const tables = [
      "chats",
      "messages",
      "users",
      "votes",
      "documents",
      "summaries",
      "usageLog",
      "userMemory",
      "skillLibrary",
    ] as const;
    for (const table of tables) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docs = await (ctx.db as any).query(table).collect();
        for (const doc of docs) {
          await ctx.db.delete(doc._id);
        }
      } catch {
        // table might not exist
      }
    }
    return "cleared";
  },
});

// ═══════════════════════════════════════════════════════════════════════
// Φ3 — stringContentToParts (idempotent). Converts legacy string content →
// AI SDK v6 parts + backfills client-side required fields so existing rows
// validate against the new schema.
//
//   messages: content(string) → parts: [{type:"text", text: content}]
//             backfill id = _id.toString()
//             (content is LEFT IN PLACE — read path prefers `parts`; field
//              dropped in a Phase 9 cleanup once all writers use parts.)
//   chats:    backfill id = _id.toString()
//             (type/workspaceId left optional; harmless, dropped Phase 9.)
//   users:    backfill memory = "" (plan H cross-chat blob)
//   schemaSessions: DELETE all docs (table dropped in new schema)
//
// The schemaSessions cleanup uses `as any` so this mutation compiles + runs
// against BOTH the old schema (schemaSessions present → rows deleted) and
// the new one (absent → query throws, caught, no-op).
//
// Deploy choreography (executed by user with `npx convex`):
//   1. `npx convex dev`  — push new convex/ code; schema.ts still has
//      schemaSessions + required content, so existing data validates.
//      (This file + the updated modules deploy; schema.ts is the NEW one
//      but its new fields are optional, so old rows pass. schemaSessions
//      removed from schema → Convex refuses push until its rows are gone.)
//      ⚠ If push refuses on schemaSessions rows, run step 2 FIRST against
//        the prior schema, THEN push.
//   2. `npx convex run migrations:stringContentToParts`
//      → returns {messages, chats, users, schemaSessions} counts.
//   3. Idempotent — safe to re-run; each step guards on field presence.
// ═══════════════════════════════════════════════════════════════════════
export const stringContentToParts = mutation({
  handler: async (ctx) => {
    let messages = 0;
    let chats = 0;
    let users = 0;
    let schemaSessions = 0;

    // 1. messages: content → parts; backfill id. Never removes legacy content
    //    (read path prefers parts; cleanup drops content in Phase 9).
    const msgs = await ctx.db.query("messages").collect();
    for (const m of msgs) {
      const patch: Record<string, unknown> = {};
      if (!m.id) patch.id = m._id.toString();
      if (!m.parts && typeof (m as { content?: unknown }).content === "string") {
        const content = (m as { content: string }).content;
        if (content.length > 0) {
          patch.parts = [{ type: "text", text: content }];
        }
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(m._id, patch);
        messages++;
      }
    }

    // 2. chats: backfill id. type/workspaceId left as-is (optional, harmless).
    const chatDocs = await ctx.db.query("chats").collect();
    for (const c of chatDocs) {
      if (!c.id) {
        await ctx.db.patch(c._id, { id: c._id.toString() });
        chats++;
      }
    }

    // 3. users: backfill memory = "".
    const userDocs = await ctx.db.query("users").collect();
    for (const u of userDocs) {
      if (u.memory === undefined) {
        await ctx.db.patch(u._id, { memory: "" });
        users++;
      }
    }

    // 4. schemaSessions: delete all. `as any` so this compiles against the
    //    new schema (where the table is dropped) — the query throws, caught.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessions = await (ctx.db as any).query("schemaSessions").collect();
      for (const s of sessions) {
        await ctx.db.delete(s._id);
        schemaSessions++;
      }
    } catch {
      // table absent (new schema deployed) — nothing to do.
    }

    return { messages, chats, users, schemaSessions };
  },
});
