// ═══════════════════════════════════════════════════════════════════════════
// Operator model allowlist (LEOPARD_ENABLED_MODELS) — the enterprise floor on
// which model the CLIENT may explicitly select.
//
// There are two narrowing layers and they mean different things:
//   - The ACTIVE registry (getActiveModels()) is the curated set whose ids may
//     be handed to a provider at all. This is safe by construction — providers
//     only ever see registry ids.
//   - LEOPARD_ENABLED_MODELS is an OPERATOR enforce-list layered on top. When
//     set, only ids it names (that are ALSO active) are permitted for an
//     explicit client `body.model`. It does not affect the server-chosen
//     default (that id is operator-configured via NIM_DEFAULT_MODEL and is the
//     trusted fallback), so a build that lists only some models still boots.
//
// Exports are pure + env-aware; unit-tested standalone.
// ═══════════════════════════════════════════════════════════════════════════

/** Parse `LEOPARD_ENABLED_MODELS` (CSV of exact model ids) → Set, or null when
 * unset/empty (no operator narrowing in effect). */
export function parseModelAllowlist(envValue: string | undefined): Set<string> | null {
  if (!envValue) return null;
  const ids = new Set(
    envValue
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return ids.size > 0 ? ids : null;
}

/** True when an EXPLICIT requested id may be selected. Unknown (not in active)
 * ids are always rejected; known-but-not-operator-listed ids are rejected only
 * when an allowlist is in effect. */
export function isModelRequestAllowed(
  requested: string,
  activeIds: Iterable<string>,
  envAllowlist: string | undefined,
): boolean {
  const active = new Set(activeIds);
  if (!active.has(requested)) return false; // typo / injection / stale id
  const allowlist = parseModelAllowlist(envAllowlist);
  if (allowlist && !allowlist.has(requested)) return false; // operator-disabled
  return true;
}