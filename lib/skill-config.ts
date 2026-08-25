"use client";

/**
 * SkillConfig — local persistence for the "+ → add skill" surface. Mirrors
 * Claude Code's ~/.claude/skills concept: each skill is a name + a body (the
 * instructions/definition that gets injected into context). Persisted to
 * localStorage.
 *
 * Two tiers:
 *  - LIBRARY skills — seeded in the global Convex `skillLibrary` table (same on
 *    every account). Permanent + non-removable, but toggleable per-install.
 *  - LOCAL skills — the user's own "+ → add skill" entries in localStorage.
 * The UI merges them: library skills first (with a "Permanent" tag), then local.
 * Only ENABLED skills' bodies ride the /api/chat payload for injection.
 */

export type SkillConfig = {
  id: string;
  name: string;
  body: string;
  /** original filename if added from a file picker */
  filename?: string;
  enabled: boolean;
  /** library skills are global/permanent — non-removable, toggleable */
  permanent?: boolean;
  /** TRUE when a permanent skill's body is locally overridden (edited). */
  overridden?: boolean;
};

/** A skill row as it comes back from the Convex `skillLibrary` table. */
export type LibrarySkill = {
  _id: string;
  slug: string;
  name: string;
  description: string;
  triggers: string[];
  body: string;
  origin: string;
  enabled: boolean;
  createdAt: number;
};

const KEY = "leopard.skills.v1";
const PERMANENT_KEY = "leopard.permanent-skills.v1";
const OVERRIDE_KEY = "leopard.skill-overrides.v1";

/** Per-install body edits for PERMANENT (library) skills. The global Convex row
 *  is shared across accounts, so an edit can't write back to it — it's stored
 *  as a local override that wins on merge. slug → edited body. */
export function loadSkillOverrides(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(OVERRIDE_KEY) ?? "{}",
    ) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSkillOverrides(overrides: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
  } catch {
    /* non-fatal */
  }
}

export function loadSkills(): SkillConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as SkillConfig[]) : null;
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* corrupted — start empty */
  }
  return [];
}

export function saveSkills(skills: SkillConfig[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(skills));
  } catch {
    /* non-fatal */
  }
}

/** Library-skill toggle state (slug → enabled), persisted locally per-install.
 *  Stored separately so it survives edits to `leopard.skills.v1` and so the
 *  Seeded set from Convex can never be removed — only flipped on/off. */
export function loadPermanentToggles(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(PERMANENT_KEY) ?? "{}",
    ) as Record<string, boolean>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function savePermanentToggles(toggles: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PERMANENT_KEY, JSON.stringify(toggles));
  } catch {
    /* non-fatal */
  }
}

let _seq = 0;
export function nextSkillId(): string {
  _seq += 1;
  return `skill-${Date.now().toString(36)}-${_seq}`;
}

/** Merge Convex library skills (permanent) with the user's local skills.
 *  Library skills come first, flagged permanent; enabled = table default
 *  overridden by any saved per-install toggle. Local skills keep localStorage
 *  enabled state (defaulting on). */
export function mergeSkills(
  library: LibrarySkill[],
  local: SkillConfig[],
): SkillConfig[] {
  const toggles = loadPermanentToggles();
  const overrides = loadSkillOverrides();
  const lib: SkillConfig[] = (library ?? []).map((s) => {
    const body = overrides[s.slug];
    return {
      id: `lib-${s.slug}`,
      name: s.name,
      body: body ?? s.body,
      enabled: toggles[s.slug] ?? s.enabled,
      permanent: true,
      overridden: body !== undefined,
    };
  });
  return [...lib, ...local];
}

/** Enabled skill bodies, for /api/chat injection. Library first, then local. */
export function getEnabledBodies(all: SkillConfig[]): string[] {
  return all.filter((s) => s.enabled).map((s) => s.body.trim());
}

/** Slug for a skill — library skills carry `lib-<slug>`; local use a kebab'd name. */
export function skillSlug(s: SkillConfig): string {
  if (s.permanent) return s.id.replace(/^lib-/, "");
  return s.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Slash-command invocation. A skill body is injected ONLY when the user message
 * invokes it with `/<slug>` (e.g. `/frontend-design build me a hero`). Returns
 * the bodies of enabled skills whose slug appears as a `/token` in `text`.
 * Matches `/slug` at a word boundary; disabled skills never fire.
 */
export function getInvokedBodies(all: SkillConfig[], text: string): string[] {
  if (!text) return [];
  const invoked = new Set(
    [...text.matchAll(/\/([a-z0-9][a-z0-9-]*)/gi)].map((m) => m[1].toLowerCase()),
  );
  if (invoked.size === 0) return [];
  return all
    .filter((s) => s.enabled && invoked.has(skillSlug(s)))
    .map((s) => s.body.trim())
    .filter(Boolean);
}