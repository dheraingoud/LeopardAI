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
 * EXCEPTION: a tool part awaiting (or carrying) a USER APPROVAL decision is not
 * an orphan. In AI SDK v7 the gate lives on the tool part itself
 * (`approval.id` + state approval-requested/approval-responded). Purging those
 * dangles the approval ("Tool call … not found for approval request …").
 */

export interface RepairablePart {
  type: string;
  state?: string;
  output?: unknown;
  toolCallId?: string;
  approvalId?: string;
  approval?: { id?: string; approved?: boolean };
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
  p.state !== "output-denied" &&
  p.output === undefined;

/**
 * A tool part that is WAITING ON THE USER is alive, not an orphan. In AI SDK
 * v7 the gate lives on the tool part itself (`approval.id`, state
 * "approval-requested" / "approval-responded") — there is no separate
 * "tool-approval-request" UI part and no top-level `approvalId`. Purging a
 * live approval dangles it ("Tool call … not found for approval request")
 * and kills the turn.
 */
const isApprovalPart = (p: RepairablePart): boolean =>
  p.approval?.id !== undefined ||
  p.approvalId !== undefined ||
  p.state === "approval-requested" ||
  p.state === "approval-responded";

/** Returns messages with orphan tool parts removed (assistant rows that go
 *  empty are kept — renderers tolerate empty part arrays). */
export function dropOrphanToolParts<T extends RepairableMessage>(messages: T[]): T[] {
  let changed = false;
  const next = messages.map((m) => {
    if (m.role !== "assistant" || !m.parts?.some(isIncompleteToolPart)) return m;
    const kept = m.parts.filter(
      (p) => !isIncompleteToolPart(p) || isApprovalPart(p),
    );
    if (kept.length === m.parts.length) return m;
    changed = true;
    return { ...m, parts: kept };
  });
  return changed ? next : messages;
}
