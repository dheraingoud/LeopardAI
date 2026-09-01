/**
 * Orphan tool-call repair.
 *
 * A terminated turn (step-cap, abort, validation error) can leave a tool
 * part stuck in `input-streaming`/`input-available` with no result. That
 * orphan poisons every LATER turn: convertToModelMessages throws "Tool
 * result is missing for tool call …" and the chat appears permanently dead
 * (2026-09-01 user report). Purging the orphan parts heals the history; the
 * model simply never sees the half-finished call.
 *
 * EXCEPTION: a tool part awaiting USER APPROVAL is not an orphan — its
 * tool-approval-request part references it. Purging those dangles the
 * approval ("Tool call … not found for approval request …").
 */

export interface RepairablePart {
  type: string;
  state?: string;
  output?: unknown;
  toolCallId?: string;
  approvalId?: string;
}

export interface RepairableMessage {
  role?: string;
  parts?: RepairablePart[];
}

const isIncompleteToolPart = (p: RepairablePart): boolean =>
  (p.type.startsWith("tool-") || p.type === "dynamic-tool") &&
  p.type !== "tool-approval-request" &&
  p.state !== "output-available" &&
  p.state !== "output-error" &&
  p.output === undefined;

/** Returns messages with orphan tool parts removed (assistant rows that go
 *  empty are kept — renderers tolerate empty part arrays). */
export function dropOrphanToolParts<T extends RepairableMessage>(messages: T[]): T[] {
  let changed = false;
  const next = messages.map((m) => {
    if (m.role !== "assistant" || !m.parts?.some(isIncompleteToolPart)) return m;
    // Tool calls with a pending approval request in the SAME message are
    // alive, not orphans.
    const pendingApproval = new Set(
      m.parts
        .filter((p) => p.type === "tool-approval-request")
        .map((p) => p.toolCallId)
        .filter(Boolean) as string[],
    );
    const kept = m.parts.filter(
      (p) =>
        !isIncompleteToolPart(p) ||
        p.approvalId !== undefined ||
        (p.toolCallId !== undefined && pendingApproval.has(p.toolCallId)),
    );
    if (kept.length === m.parts.length) return m;
    changed = true;
    return { ...m, parts: kept };
  });
  return changed ? next : messages;
}
