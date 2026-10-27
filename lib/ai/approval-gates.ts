// Pending approval-gate extraction.
//
// A turn can gate SEVERAL tool calls at once (the model asked for two fetches,
// the SDK emitted two approval requests). Both the live client parts and the
// persisted server row must therefore yield EVERY unanswered gate — returning
// only the first one left the other gates unanswerable and the turn could
// never finish (2026-10-28 live repro: two webFetch gates, one Allow/Deny
// card, the second gate buried and the turn abandoned at the 10-min ceiling).

export type PendingApprovalGate = {
  approvalId: string;
  toolName: string;
  input?: unknown;
  toolCallId?: string;
};

const TOOL_PART_TYPES = new Set(["tool-approval-request", "tool-approval-response"]);

const isToolPartType = (t: string): boolean =>
  t === "tool" || t === "dynamic-tool" || (t.startsWith("tool-") && !TOOL_PART_TYPES.has(t));

/** One gate from a tool part — or null when the part carries no live gate. */
export const approvalGateFromPart = (part: unknown): PendingApprovalGate | null => {
  const p = part as {
    type?: string;
    state?: string;
    toolName?: string;
    toolCallId?: string;
    input?: unknown;
    approval?: { id?: string };
  };
  const t = typeof p?.type === "string" ? p.type : "";
  if (!isToolPartType(t)) return null;
  if (p.state !== "approval-requested") return null;
  const approvalId = p.approval?.id;
  if (!approvalId) return null;
  const toolName =
    p.toolName ??
    (t.startsWith("tool-") && t !== "tool" ? t.slice(5) : undefined) ??
    "tool";
  return {
    approvalId,
    toolName,
    input: p.input,
    toolCallId: p.toolCallId,
  };
};

/** Every unanswered gate in one message's parts, in stream order. */
export const approvalGatesFromParts = (
  parts: unknown,
): PendingApprovalGate[] => {
  if (!Array.isArray(parts)) return [];
  const gates: PendingApprovalGate[] = [];
  for (const part of parts) {
    const gate = approvalGateFromPart(part);
    if (gate) gates.push(gate);
  }
  return gates;
};
