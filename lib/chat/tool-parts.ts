// Tool-part selection helpers.
//
// A tool part that FAILED must not mount its renderer: a failed renderWidget
// still painted the "TABLE" widget skeleton next to the red "Tool call failed"
// card. In-flight parts keep rendering (the widget fills in progressively),
// so the gate is the FAILED states only.

export type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied"
  | "interrupted";

export type ToolPartLike = {
  type?: string;
  state?: string;
  output?: unknown;
  errorText?: string;
  toolCallId?: string;
};

/** States in which the tool did not produce a result. */
const FAILED_STATES: ReadonlySet<string> = new Set([
  "output-error",
  "output-denied",
  "interrupted",
]);

export const isToolPart = (part: unknown): boolean => {
  const p = part as ToolPartLike;
  if (!p || typeof p.type !== "string") return false;
  return p.type === "dynamic-tool" || p.type.startsWith("tool-");
};

/** True when the tool failed, was declined, or was interrupted. */
export const isFailedToolPart = (part: unknown): boolean => {
  const p = part as ToolPartLike;
  if (!isToolPart(p)) return false;
  return FAILED_STATES.has(p.state ?? "");
};

/**
 * A part may mount its renderer unless the tool FAILED. A failed part is
 * rendered by the tool-error card alone.
 */
export const hasToolOutput = (part: unknown): boolean => {
  const p = part as ToolPartLike;
  if (!isToolPart(p)) return false;
  return !FAILED_STATES.has(p.state ?? "");
};

/**
 * The askUser chip renders a question awaiting an answer. A FAILED askUser is
 * not that — the chip's "…" fallback read as a live pending question after
 * the call was rejected. A denied one renders as the neutral declined chip.
 *
 * Takes the SEGMENT state ("error" / "denied"), not the part state
 * ("output-error" / "output-denied") — the transcript maps parts to segments
 * before it renders.
 */
export const rendersAskUserChip = (segmentState?: string): boolean =>
  segmentState !== "error" && segmentState !== "denied";

/** Parts of the given tool type that may render their own surface. */
export const selectRenderableToolParts = <T>(
  parts: readonly T[],
  type: string,
): T[] =>
  parts.filter((p) => {
    const t = (p as { type?: string }).type;
    return t === type && hasToolOutput(p);
  });
