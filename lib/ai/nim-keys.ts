/**
 * NIM key rotator.
 *
 * The single NVIDIA_API_KEY is the legacy path; the rotator prefers the
 * numbered pool (NVIDIA_API_KEY_1..N) and fails over between them. A key that
 * returns 401/403 (auth) is demoted for the process; 429/5xx is demoted
 * briefly (transient). Resolution is read fresh on every request, so a key
 * that recovers is usable again after its backoff.
 *
 * Why: 2026-10-05 — the primary key's inference tier died (403 on every
 * chat/completions while /v1/models still 200'd), and the app silently
 * swallowed it into a vanishing bubble. The pool spreads that risk across
 * keys; a single dead key no longer takes the app down.
 */

type KeyState = {
  key: string;
  /** Don't use this key again until this epoch ms. */
  backoffUntil: number;
  /** Permanent (auth) failure — only a process restart clears it. */
  dead: boolean;
};

let pool: KeyState[] | null = null;

function buildPool(): KeyState[] {
  if (pool) return pool;
  const keys: string[] = [];
  // Numbered pool first (the rotator's real keys)...
  for (let i = 1; i <= 8; i++) {
    const k = process.env[`NVIDIA_API_KEY_${i}`];
    if (k) keys.push(k.trim());
  }
  // ...then the legacy single key as a last resort.
  const legacy = process.env.NVIDIA_API_KEY;
  if (legacy) keys.push(legacy.trim());
  pool = keys.map((key) => ({ key, backoffUntil: 0, dead: false }));
  return pool;
}

/** Transient failures (429/5xx/timeout) back off briefly; auth (401/403) is fatal. */
const TRANSIENT_BACKOFF_MS = 60_000;

/** The current best key, or null if every key is down. */
export function currentNimKey(): string | null {
  const now = Date.now();
  const p = buildPool();
  for (const k of p) {
    if (!k.dead && k.backoffUntil <= now) return k.key;
  }
  // All in transient backoff — use the one that recovers soonest rather than fail.
  const soonest = p.filter((k) => !k.dead).sort((a, b) => a.backoffUntil - b.backoffUntil)[0];
  return soonest ? soonest.key : null;
}

/** Record a failure for the key currently in use; the next call rotates off it. */
export function reportNimKeyFailure(key: string, status?: number): void {
  const p = buildPool();
  const entry = p.find((k) => k.key === key);
  if (!entry) return;
  if (status === 401 || status === 403) {
    entry.dead = true; // auth — don't retry this key
  } else {
    entry.backoffUntil = Date.now() + TRANSIENT_BACKOFF_MS;
  }
}

/** True if any usable key exists (drives the route's key-missing pre-check). */
export function hasNimKey(): boolean {
  return buildPool().length > 0;
}

let leaseCursor = 0;

export function nimKeyPoolSize(): number {
  return buildPool().length;
}

export function leaseNimKey(leased?: Set<string>): string | null {
  const p = buildPool();
  const now = Date.now();
  const usable = p.filter((k) => !k.dead && k.backoffUntil <= now);
  if (usable.length === 0) {
    const soonest = p.filter((k) => !k.dead).sort((a, b) => a.backoffUntil - b.backoffUntil)[0];
    return soonest ? soonest.key : null;
  }
  const free = usable.filter((k) => !leased?.has(k.key));
  if (free.length === 0) return null;
  const start = leaseCursor % free.length;
  leaseCursor = (leaseCursor + 1) % free.length;
  return free[start].key;
}

export function usableNimKeyCount(leased?: Set<string>): number {
  const now = Date.now();
  return buildPool().filter(
    (k) => !k.dead && k.backoffUntil <= now && !leased?.has(k.key),
  ).length;
}
