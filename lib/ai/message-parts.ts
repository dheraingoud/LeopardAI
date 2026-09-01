/**
 * Normalize persisted UIMessage parts to the subset the AI SDK v7 strict
 * message parser accepts (the empty fed to useChat / /api/chat must validate).
 *
 * WHY: older leopard builds persisted assistant parts that v7 rejects:
 *   - `step-start` (and other stream-control chunks) leaked into message.parts;
 *   - legacy `tool-<name>` parts (`tool-webFetch`, `tool-createDocument`…)
 *     from an ingestion path that keyed the part type by tool name.
 * On reload these fail the v7 UIMessage part union ("Invalid input" zod dump)
 * and block sending on every affected chat. This maps/normalizes them to valid
 * types so existing rows keep rendering and sending.
 */

/** Part types that are pure stream/control/title signal — not renderable, not
 *  re-sendable. Dropped outright. `data-chat-title` is technically a valid
 *  `data-*` custom part, but the title is persisted separately to Convex, so
 *  it carries no load-bearing data and is dropped to keep rows tidy. */
const DROP_PART_TYPES = new Set([
  "step-start",
  "step-end",
  "start-step",
  "finish-step",
  "start",
  "finish",
  "abort",
  "message-metadata",
  "data-chat-title",
  // NOT "tool-approval-request": the SDK pairs approval request+response on
  // resend — dropping the request makes every Allow/Deny POST throw
  // ToolCallNotFoundForApprovalError (the 2026-09-01 approval-flash bug).
]);

export function normalizeUIMessageParts<T extends { type?: unknown }>(
  parts: T[] | null | undefined,
): T[] {
  if (!Array.isArray(parts)) return [];
  const out: T[] = [];
  for (const p of parts) {
    if (!p || typeof p !== "object" || typeof p.type !== "string") continue;
    const t = p.type as string;
    if (DROP_PART_TYPES.has(t)) continue;
    // KEEP `tool-<name>` typing intact: the SDK's convertToModelMessages only
    // recognizes isToolUIPart (type startsWith "tool-"), so renaming to plain
    // "tool" made tool calls (and their approval-responded state) invisible to
    // the model on the wire — an approved webFetch was never executed, the
    // model just re-asked. The renderer matches the prefix itself.
    out.push(p);
  }
  return out;
}