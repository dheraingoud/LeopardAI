// Anti-loop guard for invalid tool calls.
//
// A tool call whose arguments fail validation is fed back to the model as an
// error, and the model gets another step. A weak model that cannot fix the
// arguments re-issues the IDENTICAL broken call, and the step loop runs to
// its cap (8 steps) — eight identical failure cards and no answer.
//
// Anthropic's rule for a failed tool is to return the error RESULT so the
// model can adapt (never drop it). The AI SDK already does that, but it
// returns the raw validation dump, which does not say which field to fix.
// This module turns the SDK's step history into a directive that names the
// broken fields, and — when the model repeats the same broken call — tells it
// to stop calling the tool and answer in text instead.

type ToolCallStep = {
  content?: Array<{
    type?: string;
    toolName?: string;
    input?: unknown;
    invalid?: boolean;
    error?: unknown;
  }>;
};

export type InvalidToolCall = {
  toolName: string;
  input: unknown;
  /** Field paths from the schema error, e.g. ["images", 0, "alt"]. */
  paths: string[];
  /** How many earlier steps made the same call with the same arguments. */
  repeats: number;
};

export type RepeatedToolCall = {
  toolName: string;
  input: unknown;
  /** How many times the identical call was already made. */
  repeats: number;
};

const STEP_HISTORY_WINDOW = 4;

const readError = (error: unknown): unknown => {
  let current: unknown = error;
  for (let i = 0; i < 6; i++) {
    if (!current || typeof current !== "object") return null;
    const cause = (current as { cause?: unknown }).cause;
    if (!cause) return current;
    current = cause;
  }
  return current;
};

/** Pull the schema's field paths out of the SDK's nested validation error. */
const readIssuePaths = (error: unknown): string[] => {
  const root = readError(error);
  if (!root || typeof root !== "object") return [];
  const issues = (root as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return [];
  const paths: string[] = [];
  for (const issue of issues) {
    if (!issue || typeof issue !== "object") continue;
    const path = (issue as { path?: unknown }).path;
    if (!Array.isArray(path) || path.length === 0) continue;
    let rendered = "";
    for (const seg of path) {
      if (typeof seg === "number") {
        rendered += `[${seg}]`;
        continue;
      }
      const name = seg
        .replace(/([A-Z])/g, (m: string) => `.${m.toLowerCase()}`)
        .replace(/^_/, "");
      rendered += rendered ? `.${name}` : name;
    }
    paths.push(rendered);
  }
  return paths;
};

const fingerprint = (toolName: string, input: unknown): string => {
  let serialized: string;
  try {
    serialized = JSON.stringify(input ?? null) ?? "null";
  } catch {
    serialized = String(input);
  }
  return `${toolName}::${serialized}`;
};

const collectInvalid = (steps: unknown): InvalidToolCall[] => {
  const out: InvalidToolCall[] = [];
  const list = Array.isArray(steps) ? (steps as ToolCallStep[]) : [];
  for (const step of list.slice(-STEP_HISTORY_WINDOW)) {
    for (const part of step?.content ?? []) {
      if (part?.type !== "tool-call") continue;
      if (!part.invalid) continue;
      out.push({
        toolName: String(part.toolName ?? "the tool"),
        input: part.input,
        paths: readIssuePaths(part.error),
        repeats: 0,
      });
    }
  }
  return out;
};

/** The most recent invalid tool call, annotated with how often it repeated. */
export const lastInvalidToolCall = (steps: unknown): InvalidToolCall | null => {
  const invalid = collectInvalid(steps);
  if (invalid.length === 0) return null;
  const latest = invalid[invalid.length - 1];
  const key = fingerprint(latest.toolName, latest.input);
  latest.repeats = invalid.filter(
    (c) => fingerprint(c.toolName, c.input) === key,
  ).length;
  return latest;
};

/**
 * The corrective instruction for the step after an invalid tool call, or null
 * when there is nothing to correct.
 */
export const toolRetryDirective = (steps: unknown): string | null => {
  const call = lastInvalidToolCall(steps);
  if (!call) return null;
  if (call.repeats >= 2) {
    return (
      `Your previous ${call.toolName} call was rejected again — the same invalid ` +
      `arguments were sent twice. Do NOT call ${call.toolName} again this turn. ` +
      `Answer the user in plain text now, and say plainly that the ` +
      `${call.toolName} widget could not be rendered.`
    );
  }
  const detail = call.paths.length
    ? ` The invalid fields were: ${call.paths.join(", ")}.`
    : "";
  return (
    `Your previous ${call.toolName} call was rejected because its arguments ` +
    `did not match the tool's schema.${detail} Call ${call.toolName} again with ` +
    `corrected arguments — every required field present and of the right type. ` +
    `If you cannot produce valid arguments, answer the user in plain text ` +
    `instead of calling the tool.`
  );
};

const collectSuccessful = (steps: unknown): Array<{ toolName: string; input: unknown }> => {
  const out: Array<{ toolName: string; input: unknown }> = [];
  const list = Array.isArray(steps) ? (steps as ToolCallStep[]) : [];
  for (const step of list.slice(-STEP_HISTORY_WINDOW)) {
    for (const part of step?.content ?? []) {
      if (part?.type !== "tool-call") continue;
      if (part.invalid) continue;
      out.push({
        toolName: String(part.toolName ?? "the tool"),
        input: part.input,
      });
    }
  }
  return out;
};

/**
 * The last successful tool call that the model already made with identical
 * arguments, or null when every call so far was distinct.
 */
export const repeatedToolCall = (steps: unknown): RepeatedToolCall | null => {
  const calls = collectSuccessful(steps);
  if (calls.length === 0) return null;
  let latest: RepeatedToolCall | null = null;
  for (const call of calls) {
    const key = fingerprint(call.toolName, call.input);
    const repeats = calls.filter(
      (c) => fingerprint(c.toolName, c.input) === key,
    ).length;
    if (repeats > 1) latest = { toolName: call.toolName, input: call.input, repeats };
  }
  return latest;
};

/**
 * The instruction that stops the model from rendering the same card again, or
 * null when no call repeated.
 */
export const repeatedToolCallDirective = (steps: unknown): string | null => {
  const call = repeatedToolCall(steps);
  if (!call) return null;
  return (
    `You already called ${call.toolName} ${call.repeats} times in this turn ` +
    `with the same arguments, and each call produced the same result — the ` +
    `user would see ${call.repeats} identical copies. Do NOT call ` +
    `${call.toolName} again this turn. Answer the user in plain text now.`
  );
};
