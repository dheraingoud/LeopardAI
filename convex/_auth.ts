// Φ9: shared ownership check. Every chat-scoped mutation calls
// requireChatOwner(ctx, chatId, userId) before any side-effect — kills the
// repeated `if (!chat || chat.userId !== args.userId) throw …` pattern.
// Returns the chat row so callers don't need a second `db.get` if they need
// fields.

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type AnyCtx = MutationCtx | QueryCtx;
type Chat = { _id: Id<"chats">; userId: string };

export async function requireChatOwner<C extends AnyCtx>(
  ctx: C,
  chatId: Id<"chats">,
  userId: string,
): Promise<Chat> {
  const chat = (await ctx.db.get(chatId)) as Chat | null;
  if (!chat || chat.userId !== userId) {
    throw new Error("Unauthorized or not found");
  }
  return chat;
}

type DocumentRow = { _id: Id<"documents">; id: string; userId: string; createdAt: number };

export async function requireDocumentOwner<C extends AnyCtx>(
  ctx: C,
  id: string,
  userId: string,
  opts: { createdAt?: number } = {},
): Promise<DocumentRow> {
  // Use the composite index when a createdAt is supplied; otherwise resolve
  // via the latest version with the same id.
  const doc = (opts.createdAt
    ? await ctx.db
        .query("documents")
        .withIndex("by_id_createdAt", (q) =>
          q.eq("id", id).eq("createdAt", opts.createdAt!)
        )
        .first()
    : await ctx.db
        .query("documents")
        .withIndex("by_public_id", (q) => q.eq("id", id))
        .order("desc")
        .first()) as DocumentRow | null;
  if (!doc) throw new Error("Document version not found");
  if (doc.userId !== userId) throw new Error("Unauthorized");
  return doc;
}

// Re-export so mutation files can `import { v } from "./_auth"` and keep
// the v-as-reference near the ownership helpers in the same file.
export { v };

