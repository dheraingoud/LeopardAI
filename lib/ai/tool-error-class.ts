// Tool-failure classification.
//
// A failed tool call is NOT a failed turn. The AI SDK renders an invalid tool
// call as a part-level `tool-input-error` chunk and keeps synthesizing; a
// tool that throws renders as `tool-output-error`. Both are routed through
// the stream's `onError` callback, and a handler that emits a stream-level
// `error` chunk for them flips the client into status "error" — the red
// "That didn't go through" card — even though the answer is still coming.
//
// This module tells the stream handler which errors are tool-scoped (fail
// silently: the tool part carries the failure) and which are stream-scoped
// (surface them).

const TOOL_ERROR_NAMES = [
  "InvalidToolInputError",
  "NoSuchToolError",
  "ToolCallRepairError",
  "AI_InvalidToolInputError",
  "AI_NoSuchToolError",
];

const TOOL_ERROR_PATTERNS = [
  /invalid\s*tool\s*input/i,
  /tool\s+input.*(invalid|not\s+valid)/i,
  /no\s+such\s*tool/i,
  /tool\s+call\s+not\s+found/i,
  /unknown\s+tool/i,
];

/** True when the error is a tool-call failure (not a stream failure). */
export const isToolScopedError = (error: unknown): boolean => {
  if (!error) return false;
  const name =
    (error as { name?: unknown }).name ??
    (error as { constructor?: { name?: string } }).constructor?.name;
  if (typeof name === "string" && TOOL_ERROR_NAMES.includes(name)) return true;
  const message =
    typeof (error as { message?: unknown }).message === "string"
      ? ((error as { message: string }).message)
      : typeof error === "string"
        ? error
        : "";
  return TOOL_ERROR_PATTERNS.some((re) => re.test(message));
};
