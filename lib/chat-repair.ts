/**
 * Orphan tool-call repair.
 *
 * A terminated turn (step-cap, abort, validation error) can leave a tool
 * part stuck in `input-streaming`/`input-available` with no result. That
 * orphan poisons every LATER turn: convertToModelMessages throws "Tool
 * result is missing for tool call …" and the chat appears permanently dead
 * (2026-09-01 user report). Purging the orphan parts heals the history; the
 * model simply never sees the half-finished call.
 */

export interface RepairablePart {
  type: string;
  state?: string;
  output?: unknown;
}

export interface RepairableMessage {
  role?: string;
  parts?: RepairablePart[];
}

const isOrphanToolPart = (p: RepairablePart): boolean =>
  (p.type.startsWith("tool-") || p.type === "dynamic-tool") &&
  p.state !== "output-available" &&
  p.state !== "output-error" &&
  p.output === undefined;

/** Returns messages with orphan tool parts removed (assistant rows that go
 *  empty are kept — renderers tolerate empty part arrays). */
export function dropOrphanToolParts<T extends RepairableMessage>(messages: T[]): T[] {
  let changed = false;
  const next = messages.map((m) => {
    if (m.role !== "assistant" || !m.parts?.some(isOrphanToolPart)) return m;
    changed = true;
    return { ...m, parts: m.parts.filter((p) => !isOrphanToolPart(p)) };
  });
  return changed ? next : messages;
}
