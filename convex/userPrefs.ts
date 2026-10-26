// User-scoped preference store — one row per clerkId; every field is optional
// and only the fields present in the patch are written.
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

const prefsRow = v.object({
  _id: v.id("userPrefs"),
  _creationTime: v.number(),
  clerkId: v.string(),
  lastModel: v.optional(v.string()),
  theme: v.optional(v.string()),
  sendWithEnter: v.optional(v.boolean()),
  webFetchEnabled: v.optional(v.boolean()),
  reasoning: v.optional(v.record(v.string(), v.string())),
  mcpServers: v.optional(v.any()),
  skills: v.optional(v.any()),
  permanentToggles: v.optional(v.record(v.string(), v.boolean())),
  skillOverrides: v.optional(v.record(v.string(), v.string())),
  updatedAt: v.number(),
});

export const get = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userPrefs")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
  },
  returns: v.union(v.null(), prefsRow),
});

export const set = mutation({
  args: {
    clerkId: v.string(),
    lastModel: v.optional(v.string()),
    theme: v.optional(v.string()),
    sendWithEnter: v.optional(v.boolean()),
    webFetchEnabled: v.optional(v.boolean()),
    reasoning: v.optional(v.record(v.string(), v.string())),
    mcpServers: v.optional(v.any()),
    skills: v.optional(v.any()),
    permanentToggles: v.optional(v.record(v.string(), v.boolean())),
    skillOverrides: v.optional(v.record(v.string(), v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { clerkId, ...fields } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }
    const existing = await ctx.db
      .query("userPrefs")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...patch, updatedAt: Date.now() });
      return;
    }
    await ctx.db.insert("userPrefs", {
      clerkId,
      ...patch,
      updatedAt: Date.now(),
    });
  },
});
