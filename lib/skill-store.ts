"use client";

/**
 * Shared reactive store for skills. Backs both the client transport
 * (`getEnabledSkillBodies()` → /api/chat `skills`) and the "+ → add skill"
 * modal (merged Convex permanent skills + local skills). Mirrors the Convex
 * `skillLibrary` table into the client; local edits persist to localStorage.
 *
 * Why a store (not just the hook/CSR): multiple independent surfaces — useChat
 * transport, SkillConfigModal, window-focus refresh — must read the same list
 * without prop-drilling. Any write re-emits, and UI re-renders via
 * `useSyncExternalStore`.
 */

import {
  loadSkills,
  saveSkills,
  loadPermanentToggles,
  savePermanentToggles,
  loadSkillOverrides,
  saveSkillOverrides,
  mergeSkills,
  getInvokedBodies,
  skillSlug,
  type LibrarySkill,
  type SkillConfig,
} from "@/lib/skill-config";

/** Convex `skillLibrary` rows, as hydrated by `useSkillLibrary`. */
let library: LibrarySkill[] = [];

/** The merged list (permanent + local) consumed by UI + transport. */
let merged: SkillConfig[] = seedMerged();

function seedMerged(): SkillConfig[] {
  // localStorage has no server-side library, so merged panel starts with local
  // skills only; library rows arrive on the first Convex hydration.
  return mergeSkills([], loadSkills());
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

function refreshMerged(): void {
  merged = mergeSkills(library, loadSkills());
  emit();
}

/** Hydrate the Convex library into the store (called by useSkillLibrary). */
export function setLibrary(rows: LibrarySkill[]): void {
  library = Array.isArray(rows) ? rows : [];
  refreshMerged();
}

/** Current merged list (permanent-first). Safe on the client only. */
export function getMergedSkills(): SkillConfig[] {
  return merged;
}

/** Snapshot for `useSyncExternalStore`. */
export function getSkillsSnapshot(): SkillConfig[] {
  return merged;
}

export function subscribeSkills(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Replace the local (non-permanent) skill list. Accepts the *merged* array from
 * the modal; permanent rows are dropped here so they never leak into
 * localStorage.
 */
export function setLocalSkills(next: SkillConfig[]): void {
  const local = (Array.isArray(next) ? next : []).filter((s) => !s.permanent);
  saveSkills(local);
  refreshMerged();
}

/** Flip a library (permanent) skill's per-install enabled toggle. */
export function togglePermanentSkill(slug: string, enabled: boolean): void {
  const toggles = loadPermanentToggles();
  toggles[slug] = enabled;
  savePermanentToggles(toggles);
  refreshMerged();
}

/** Enabled skill bodies, for /api/chat injection. */
export function getEnabledSkillBodies(): string[] {
  return merged.filter((s) => s.enabled).map((s) => s.body.trim());
}

/** Slash-invoked skill bodies for a user message — only `/<slug>` skills fire. */
export function getInvokedSkillBodies(text: string): string[] {
  return getInvokedBodies(merged, text);
}

/** Edit a skill body. Permanent (library) skills get a local override (the
 *  global Convex row is shared across accounts — never written back); local
 *  skills update in place. */
export function updateSkillBody(id: string, body: string): void {
  const target = merged.find((s) => s.id === id);
  if (!target) return;
  if (target.permanent) {
    const overrides = loadSkillOverrides();
    overrides[skillSlug(target)] = body;
    saveSkillOverrides(overrides);
  } else {
    saveSkills(loadSkills().map((s) => (s.id === id ? { ...s, body } : s)));
  }
  refreshMerged();
}

/** Revert a permanent skill's local override back to the library body. */
export function resetSkillOverride(id: string): void {
  const target = merged.find((s) => s.id === id);
  if (!target?.permanent) return;
  const overrides = loadSkillOverrides();
  delete overrides[skillSlug(target)];
  saveSkillOverrides(overrides);
  refreshMerged();
}

/** Non-reactive read for one-shot contexts (rarely needed). */
export function getSkillsSnapshotSync(): SkillConfig[] {
  return merged;
}