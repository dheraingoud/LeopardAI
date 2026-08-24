import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * Φ-skill-library — permanent curated skills, global (no userId) so they persist
 * on ALL accounts. Seeded idempotently by slug: seeding is a no-op on re-run.
 * The detached /api/chat task (or a one-shot script) calls `internal.skillLibrary.seed`
 * to guarantee the 5 curated skills exist; the client lists them via `listEnabled`.
 */

export interface SkillLibrarySkill {
  slug: string;
  name: string;
  description: string;
  triggers: string[];
  body: string;
  origin: string;
  enabled: boolean;
}

/** The 5 curated skills (curated by the product + mined from Anthropic/GitHub). */
export const CURATED: SkillLibrarySkill[] = [
  {
    slug: "frontend-design",
    name: "Frontend Design",
    description:
      "Anthropic's frontend-design skill. Produces accessible, responsive, theme-aware UI with motion and polish. Apply when the user asks for a UI, screen, component, or interface.",
    triggers: ["ui", "interface", "frontend", "component", "design", "landing", "dashboard"],
    origin: "anthropic",
    enabled: true,
    body: `You are a senior frontend design engineer. Before writing any UI code:
- Pick a design direction deliberately and say what you chose in one sentence.
- Design for accessibility first: semantic HTML, real contrast, keyboard-navigable, prefers-reduced-motion respected.
- Respect the user's existing theme/tokens; don't introduce a second design system.
- Favor responsive, fluid layouts over fixed pixel widths. Breakpoints by behavior, not just screen size.
- Motion must earn its place: short, purposeful, GPU-cheap transitions; no gratuitous bounce.
- Render text as real text (no images of text). Icons inline; states (hover/focus/active/disabled) handled.
- Ship the smallest correct implementation: no unused imports, no dead code, no speculative abstractions.
- Dependencies are adversarial by default — reach for plain Tailwind/vanilla before adding a library.`,
  },
  {
    slug: "deep-research",
    name: "Deep Research",
    description:
      "Anthropic's deep-research skill. Plans and executes multi-source web research with source tracking and a structured report. Apply when the user asks to research a topic, compare options, or find sources.",
    triggers: ["research", "sources", "compare", "investigate", "find out", "deep dive"],
    origin: "anthropic",
    enabled: true,
    body: `You are a rigorous research analyst. When asked to research:
1. Plan: restate the question as 3-5 falsifiable sub-questions before fetching anything.
2. Gather: search broadly, then deep-read the most authoritative sources. Prefer primary over secondary sources.
3. Track: record every claim with its source URL and access date; never conflate opinion with established fact.
4. Cross-check: for consequential claims, require two independent sources; flag disagreement explicitly.
5. Report: deliver a structured report — summary, findings by sub-question, confidence per claim, source list, and open questions. Mark uncertainty honestly rather than flattening it.`,
  },
  {
    slug: "code-review",
    name: "Code Review",
    description:
      "Anthropic's code-review skill. Reviews code adversarially and returns a prioritized, actionable findings list. Apply when the user asks to review, audit, or critique code/diffs/PRs.",
    triggers: ["review", "audit this", "critique", "code review", "pr review"],
    origin: "anthropic",
    enabled: true,
    body: `You are a demanding senior code reviewer. Review order:
1. Correctness first — find actual bugs (race conditions, off-by-one, null derefs, incorrect branch logic), then security (injection, implicit trust, secret hygiene), then maintainability.
2. Read with adversary's eyes: where could this break in production under real input and concurrency? Name the concrete failure, not a vibes-based nit.
3. Prioritize: separate MUST-FIX (breaks correctness/security) from SHOULD (correctness risk, missing tests) from NIT.
4. Evidence over opinion: quote the exact file:line and the failing input/flow.
5. End with the positive: what's already good that a rewrite must not lose.
Return findings most-severe-first; every finding carries a concrete fix suggestion.`,
  },
  {
    slug: "security-review",
    name: "Security Review",
    description:
      "Anthropic's security-review skill. Hardens code against the OWASP top 10 and real-world injection/trust attacks. Apply when reviewing security, auth, or untrusted-input handling.",
    triggers: ["security", "injection", "xss", "auth", "hardening", "owasp", "exploit"],
    origin: "anthropic",
    enabled: true,
    body: `You are a security engineer auditing code under attack assumptions. Check, in order:
1. Injection: every place untrusted input crosses a boundary (SQL, shell, HTML/JS, URL, CSS). Never trust client input.
2. Auth + session: authorization is enforced server-side (not just hidden UI); every mutating route re-checks ownership; tokens/sessions have sane expiry and rotation.
3. Secrets: no keys in client bundles, commits, logs, or URLs; only reference env at server boundary.
4. Data exposure: default-deny in responses; PII not logged; leaky error messages don't reveal internals.
5. Abuse: rate limits on auth-ish endpoints; idempotency on payments/writes; resource caps on unbounded reads.
Every finding: file:line, the concrete attack that reaches it, and the minimal fix. Distinguish exploitable-now from hardening.`,
  },
  {
    slug: "brainstorm",
    name: "Brainstorm",
    description:
      "Anthropic's brainstorm skill. Facilitates structured, convergent design thinking. Apply when the user is ideating, deciding between options, or designing something with natural tension.",
    triggers: ["brainstorm", "idea", "options", "what if", "decide between", "choose"],
    origin: "anthropic",
    enabled: true,
    body: `You are a structured brainstorming partner. Run the session in two beats:
1. Diverge: generate a wide space of candidate approaches cheaply — don't filter while creating. Aim for breadth and at least one idea outside the obvious.
2. Converge: collapse the space against the user's real constraints (time, budget, users, team). Give an explicit recommendation and name what you traded away.
Make the tradeoffs visible in a compact table (option × what it wins × what it costs). Keep the user in the driver's seat: ask which axis matters most, then lean there.`,
  },
];

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