// Allow/Deny selection + decision write, extracted from convex/messages.ts.
// Generic over the row's _id type so Convex's branded Id<"messages"> satisfies it.

export type ApprovalTargetRow<TId = unknown> = {
  _id: TId;
  role: string;
  parts?: unknown;
};

export type ApprovalTarget<TId = unknown> = {
  rowIndex: number;
  rowId: TId;
  partIndex: number;
};

export function findApprovalTarget<T extends ApprovalTargetRow>(
  rows: readonly T[],
  approvalId: string,
): ApprovalTarget<T["_id"]> | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.role !== "assistant") continue;
    const parts = Array.isArray(row.parts) ? row.parts : [];
    const at = parts.findIndex(
      (p) =>
        (p as { state?: string })?.state === "approval-requested" &&
        (p as { approval?: { id?: string } })?.approval?.id === approvalId,
    );
    if (at < 0) continue;
    return { rowIndex: i, rowId: row._id, partIndex: at };
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
