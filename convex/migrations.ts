import { mutation } from "./_generated/server";

// One-time migration to clear old data
export const clearAll = mutation({
  handler: async (ctx) => {
    // Clear all tables (only valid tables from schema)
    const tables = ["chats", "messages", "users"] as const;
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
