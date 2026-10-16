// Allow/Deny selection + decision write, extracted from convex/messages.ts.
// isPendingApprovalPart is the single shared pending-gate predicate.

export function isPendingApprovalPart(p: unknown): boolean {
  return (p as { state?: string } | null)?.state === "approval-requested";
}

export type ApprovalTarget = {
  rowIndex: number;
  partIndex: number;
};

export function findApprovalTarget(
  rows: readonly { _id: unknown; role: string; parts?: unknown }[],
  approvalId: string,
): ApprovalTarget | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.role !== "assistant") continue;
    const parts = Array.isArray(row.parts) ? row.parts : [];
    const at = parts.findIndex(
      (p) => isPendingApprovalPart(p) && (p as { approval?: { id?: string } })?.approval?.id === approvalId,
    );
    if (at < 0) continue;
    return { rowIndex: i, partIndex: at };
  }
  return null;
}

export function applyApprovalDecision(
  parts: readonly unknown[],
  partIndex: number,
  decision: { approvalId: string; approved: boolean; reason?: string },
): unknown[] {
  return parts.map((p, idx) => {
    if (idx !== partIndex) return p;
    return {
      ...(p as object),
      state: "approval-responded",
      approval: {
        ...((p as { approval?: object }).approval ?? {}),
        id: decision.approvalId,
        approved: decision.approved,
        ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
      },
    };
  });
}
