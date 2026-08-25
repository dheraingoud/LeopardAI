import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { CURATED } from "./skillLibrary.generated";

/**
 * Φ-skill-library — permanent curated skills, global (no userId) so they persist
 * on ALL accounts. Seeded idempotently by slug: seeding is a no-op on re-run.
 * The detached /api/chat task (or a one-shot script) calls `internal.skillLibrary.seed`
 * to guarantee the 5 curated skills exist; the client lists them via `listEnabled`.
 */

/**
 * Read all skills in the library. Used by the client to merge permanent skills
 * with localStorage ones (permanent: non-removable, toggleable).
 */
export const listAll = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("skillLibrary"),
      _creationTime: v.number(),
      slug: v.string(),
      name: v.string(),
      description: v.string(),
      triggers: v.array(v.string()),
      body: v.string(),
      origin: v.string(),
      enabled: v.boolean(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx) =>
    ctx.db
      .query("skillLibrary")
      .withIndex("by_slug")
      .order("asc")
      .collect(),
});

/**
 * Read only enabled skills. Used by the injection path to attach bodies to the
 * system prompt.
 */
export const listEnabled = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("skillLibrary"),
      _creationTime: v.number(),
      slug: v.string(),
      name: v.string(),
      description: v.string(),
      triggers: v.array(v.string()),
      body: v.string(),
      origin: v.string(),
      enabled: v.boolean(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx) =>
    ctx.db
      .query("skillLibrary")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect(),
});

/** Idempotent seed: upsert each curated skill by slug (no-op on re-run). */
export const seed = internalMutation({
  args: {},
  returns: v.object({ seeded: v.number(), total: v.number() }),
  handler: async (ctx) => {
    let upserted = 0;
    for (const skill of CURATED) {
      const existing = await ctx.db
        .query("skillLibrary")
        .withIndex("by_slug", (q) => q.eq("slug", skill.slug))
        .first();
      if (existing) {
        const changed =
          existing.body !== skill.body ||
          existing.name !== skill.name ||
          existing.description !== skill.description ||
          existing.enabled !== skill.enabled;
        if (changed) {
          await ctx.db.patch(existing._id, {
            name: skill.name,
            description: skill.description,
            triggers: skill.triggers,
            body: skill.body,
            origin: skill.origin,
            enabled: skill.enabled,
          });
          upserted += 1;
        }
      } else {
        await ctx.db.insert("skillLibrary", {
          ...skill,
          createdAt: Date.now(),
        });
        upserted += 1;
      }
    }
    return { seeded: upserted, total: CURATED.length };
  },
});

/** Toggle a skill on/off by slug. */
/** Public, idempotent, self-healing seed trigger (the app calls this once on
 *  load; the underlying internal upsert-by-slug is a no-op on re-run). A public
 *  action is the only surface the Next server / client can reach over HTTP. */
export const seedLibrary = action({
  args: {},
  returns: v.object({ seeded: v.number(), total: v.number() }),
  handler: async (
    ctx
  ): Promise<{ seeded: number; total: number }> =>
    ctx.runMutation(internal.skillLibrary.seed, {}),
});

export const setEnabled = internalMutation({
  args: { slug: v.string(), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { slug, enabled }) => {
    const skill = await ctx.db
      .query("skillLibrary")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (skill) await ctx.db.patch(skill._id, { enabled });
  },
});

/** Public read of the whole library (all rows, enabled + disabled). The client
 *  uses this to render the merge panel and to re-sync on window focus. */
export const listLibrary = query({
  args: {},
  returns: v.array(
    v.object({
      slug: v.string(),
      name: v.string(),
      description: v.string(),
      triggers: v.array(v.string()),
      body: v.string(),
      origin: v.string(),
      enabled: v.boolean(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx) =>
    ctx.db
      .query("skillLibrary")
      .withIndex("by_slug")
      .order("asc")
      .collect()
      .then((rows) =>
        rows.map(({ _id, _creationTime, ...rest }) => rest)
      ),
});