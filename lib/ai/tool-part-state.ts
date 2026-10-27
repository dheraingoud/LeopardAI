// Tool-part terminal-state helpers.
//
// A tool part must always reach a terminal state (output-available /
// output-error / output-denied). A part left in `approval-responded` with no
// output is poison: the SDK's convertToModelMessages keeps approval-responded
// but emits NO tool-result for it (only output-* states produce one), so the
// next turn carries a tool-call without a result → MissingToolResultsError →
// the chat bricks. Closing such parts is the fix.
//
// A settled part must also drop its `approval`. The SDK re-executes an
// approved tool call when it finds a tool-approval-response WITHOUT a
// matching tool-result, so a settled part that keeps its approval can be run
// twice. Stripping it leaves the tool-call + tool-result pair the model needs
// and removes the SDK's re-execution trigger.

export type ToolPartLike = {
  type?: string;
  state?: string;
  output?: unknown;
  errorText?: string;
  toolCallId?: string;
  approval?: { id?: string; approved?: boolean; reason?: string };
};

export const HUNG_APPROVAL_ERROR =
  "This action did not complete (the turn was interrupted).";

export const isToolPart = (p: unknown): boolean => {
  const t = (p as { type?: string } | null)?.type;
  return typeof t === "string" && (t.startsWith("tool-") || t === "dynamic-tool");
};

export const isTerminalToolState = (state: unknown): boolean =>
  state === "output-available" ||
  state === "output-error" ||
  state === "output-denied" ||
  state === "interrupted";

/** A tool part that carries a decision but never produced a result. */
export const isHungApprovalPart = (p: unknown): boolean => {
  const part = p as ToolPartLike;
  if (!isToolPart(part)) return false;
  if (part.state !== "approval-responded") return false;
  return part.output === undefined && part.errorText === undefined;
};

/** Close every hanging approval part so the history stays convertible. */
export const closeHungApprovalParts = <T>(parts: readonly T[]): T[] =>
  parts.map((p) => {
    if (!isHungApprovalPart(p)) return p;
    const part = p as ToolPartLike;
    return {
      ...(part as object),
      state: "output-error",
      errorText: HUNG_APPROVAL_ERROR,
      output: HUNG_APPROVAL_ERROR,
    } as unknown as T;
  });

export const DECLINED_TOOL_ERROR =
  "The user declined this action. Do not retry it.";

/**
 * Settle one tool part for the model conversation.
 *
 * The result (when the call ran) wins, then the refusal, then the hung-call
 * repair. Every settled part leaves with `approval` dropped so the SDK cannot
 * re-execute it; a part still waiting for a decision keeps its approval so the
 * gate stays visible.
 */
export const settleResumeToolPart = <T>(
  part: T,
  resumeOutputs: ReadonlyMap<string, unknown>,
): T => {
  const p = part as unknown as ToolPartLike;
  if (!p.toolCallId) return part;
  if (resumeOutputs.has(p.toolCallId)) {
    return {
      ...(part as object),
      state: "output-available",
      output: resumeOutputs.get(p.toolCallId),
      approval: undefined,
    } as unknown as T;
  }
  if (p.state === "output-denied") {
    return {
      ...(part as object),
      state: "output-error",
      output: DECLINED_TOOL_ERROR,
      errorText: DECLINED_TOOL_ERROR,
      approval: undefined,
    } as unknown as T;
  }
  if (p.state === "approval-responded" && p.output !== undefined) {
    return {
      ...(part as object),
      state: "output-available",
      approval: undefined,
    } as unknown as T;
  }
  if (p.state === "approval-responded" && p.output === undefined) {
    return {
      ...(part as object),
      state: "output-error",
      output: HUNG_APPROVAL_ERROR,
      errorText: HUNG_APPROVAL_ERROR,
      approval: undefined,
    } as unknown as T;
  }
  return part;
};
