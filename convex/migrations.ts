import { mutation } from "./_generated/server";

// One-time migration to clear old data
export const clearAll = mutation({
  handler: async (ctx) => {
    // Clear all tables
    const tables = ["chats", "messages", "users", "contextWindows"] as const;
    for (const table of tables) {
      try {
        const docs = await ctx.db.query(table as any).collect();
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
