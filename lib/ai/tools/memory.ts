// Φ-docs · per-user long-term memory — model tools.
//
// The model can persist a fact it just learned (`remember`), enumerate what it
// already knows (`listMemories`), and remove a fact that is no longer true
// (`forgetById`). On the next turn these facts are injected into the system
// prompt (lib/ai/prompts.ts `systemPrompt({memories})`), so the model carries
// the user's standing preferences, identity, and facts across conversations.
// Persistence is Convex-backed via lib/ai/server-generation.ts; the user's own
// delete UI mirrors the same storage.
//
// Design: tools return a result envelope, never throw — a persistence failure
// is surfaced as text the model can react to without breaking the loop (same
// contract as webSearch/webFetch). Deduplication is server-side (memory key =
// normalized text); `remember` on an existing fact updates it in place.

import { tool } from "ai";
import { z } from "zod";
import {
  listUserMemories,
  rememberUserMemory,
  forgetUserMemory,
} from "@/lib/ai/server-generation";

export type MemoryToolContext = { userId: string };

const MAX_TEXT_LENGTH = 4000;

export const memoryTools = ({ userId }: MemoryToolContext) => ({
  // Keys are prefixed `memory_` so TOOL_APPROVAL_RULES can scope them cleanly
  // (e.g. `memory_=allow`) and the gate below treats them as low-risk.
  memory_remember: tool({
    description:
      "Save a durable fact about the user that should be remembered across " +
      "conversations (preferences, identity, standing decisions, recurring " +
      "needs). Use only for stable, generally-useful facts, not one-off task " +
      "context. Re-saving an existing fact updates it. Keep facts short and " +
      "statement-like.",
    inputSchema: z.object({
      text: z
        .string()
        .max(MAX_TEXT_LENGTH)
        .describe("The fact to remember, e.g. 'User prefers dark mode'."),
      pinned: z
        .boolean()
        .optional()
        .describe("Mark highly important facts as pinned so they always surface."),
    }),
    execute: async ({ text, pinned }) => {
      try {
        const total = await rememberUserMemory({ userId, text, pinned });
        return {
          saved: true,
          total,
          note: `Saved to memory. ${total} total fact${total === 1 ? "" : "s"} on file.`,
        };
      } catch (err) {
        return {
          saved: false,
          error: err instanceof Error ? err.message : String(err),
          note: "Could not persist the fact — tell the user it wasn't saved.",
        };
      }
    },
  }),

  memory_list: tool({
    description:
      "List the facts currently remembered for the user (pinned first, newest " +
      "first). Read this before calling forgetById so you know the exact id.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const rows = await listUserMemories(userId);
        return {
          count: rows.length,
          memories: rows.map((r) => ({ id: r.id, text: r.text, pinned: r.pinned })),
        };
      } catch (err) {
        return {
          count: 0,
          memories: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  }),

  memory_forget: tool({
    description:
      "Remove a specific remembered fact by its id (get ids from listMemories).",
    inputSchema: z.object({
      id: z.string().describe("The memory id returned by listMemories."),
    }),
    execute: async ({ id }) => {
      try {
        const removed = await forgetUserMemory({ userId, memoryId: id });
        return {
          removed,
          note: removed
            ? "That fact was removed from memory."
            : "Could not remove that fact (already gone or not yours).",
        };
      } catch (err) {
        return {
          removed: false,
          error: err instanceof Error ? err.message : String(err),
          note: "Could not remove the fact — tell the user it's still there.",
        };
      }
    },
  }),
});