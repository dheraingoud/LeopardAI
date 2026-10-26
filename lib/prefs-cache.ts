// Leopard prefs cache — the client-side mirror of the Convex `userPrefs` row.
// Plain modules need synchronous reads, so the hydrated value is mirrored here and every write goes to the transport installed by the React layer.

export type PrefsSnapshot = {
  clerkId: string | null;
  lastModel?: string;
  theme?: string;
  sendWithEnter?: boolean;
  webFetchEnabled?: boolean;
  reasoning?: Record<string, string>;
  mcpServers?: unknown;
  skills?: unknown;
  permanentToggles?: Record<string, boolean>;
  skillOverrides?: Record<string, string>;
};

export type PrefsWriter = (fields: Partial<PrefsSnapshot>) => void;

let snapshot: PrefsSnapshot = { clerkId: null };
let pending: Partial<PrefsSnapshot> = {};
let writer: PrefsWriter | null = null;
const dirty = new Set<keyof PrefsSnapshot>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function getPrefsSnapshot(): PrefsSnapshot {
  return snapshot;
}

export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setPrefsWriter(next: PrefsWriter | null): void {
  writer = next;
  if (next && Object.keys(pending).length > 0) flushPending();
}

export function clearPrefsWriter(current: PrefsWriter): void {
  if (writer === current) writer = null;
}

export function setPrefsSnapshot(patch: Partial<PrefsSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  emit();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergePatch(
  patch: Partial<PrefsSnapshot>,
): Partial<PrefsSnapshot> {
  const merged: Record<string, unknown> = { ...patch };
  for (const key of Object.keys(patch) as (keyof PrefsSnapshot)[]) {
    const next = patch[key];
    const current = snapshot[key];
    if (isPlainObject(next) && isPlainObject(current)) {
      merged[key] = { ...current, ...next };
    }
  }
  return merged as Partial<PrefsSnapshot>;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a === "object" && typeof b === "object") {
    try {
      return stableJson(a) === stableJson(b);
    } catch {
      return false;
    }
  }
  return false;
}

function flushPending(): void {
  if (!writer || Object.keys(pending).length === 0) return;
  const queued = pending;
  pending = {};
  writer(queued);
}

export function hydratePrefs(
  clerkId: string,
  server: Partial<PrefsSnapshot>,
): void {
  const next = { ...snapshot };
  for (const key of Object.keys(server) as (keyof PrefsSnapshot)[]) {
    if (dirty.has(key)) {
      if (sameValue(server[key], snapshot[key])) dirty.delete(key);
      else continue;
    }
    (next as Record<string, unknown>)[key] = server[key];
  }
  snapshot = { ...next, clerkId };
  emit();
  flushPending();
}

export function writePrefs(patch: Partial<PrefsSnapshot>): void {
  const merged = mergePatch(patch);
  setPrefsSnapshot(merged);
  for (const key of Object.keys(merged) as (keyof PrefsSnapshot)[]) {
    dirty.add(key);
  }
  pending = { ...pending, ...merged };
  flushPending();
}
