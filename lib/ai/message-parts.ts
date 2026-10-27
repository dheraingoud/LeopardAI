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

/** Part types that carry the approval PAIR rather than a tool invocation.
 *  They must never be merged with the tool part they belong to — the SDK
 *  pairs request+response on resend and throws when the request is missing. */
const APPROVAL_PAIR_TYPES: ReadonlySet<string> = new Set([
  "tool-approval-request",
  "tool-approval-response",
]);

/** How far a tool part has progressed. A higher rank wins a duplicate. */
const TOOL_STATE_RANK: Record<string, number> = {
  "input-streaming": 0,
  "input-available": 1,
  "approval-requested": 1,
  "approval-responded": 2,
  "output-available": 3,
  "output-error": 3,
  "output-denied": 3,
  interrupted: 3,
};

const toolPartRank = (p: unknown): number => {
  const state = (p as { state?: unknown }).state;
  return typeof state === "string" ? (TOOL_STATE_RANK[state] ?? 0) : 0;
};

const toolCallIdOf = (p: unknown): string | undefined => {
  const id = (p as { toolCallId?: unknown }).toolCallId;
  return typeof id === "string" && id !== "" ? id : undefined;
};

/**
 * Keep one part per tool call.
 *
 * The SDK updates a tool part only inside the CURRENT step, so a resumed turn
 * that answers a call from an earlier step appends a SECOND part with the same
 * toolCallId. Two parts for one call become two tool-call/tool-result pairs on
 * the wire, and the provider rejects the duplicate id — the next message in the
 * chat then fails even though the turn itself succeeded.
 *
 * The winner is the most advanced copy; it keeps the position of the FIRST
 * occurrence so the rendered order (reasoning → tool → answer) is unchanged.
 */
export const dedupeToolParts = <T extends { type?: unknown }>(parts: T[]): T[] => {
  const winner = new Map<string, { part: T; rank: number; first: number }>();
  parts.forEach((p, index) => {
    const type = (p as { type?: unknown }).type;
    if (typeof type !== "string") return;
    if (APPROVAL_PAIR_TYPES.has(type)) return;
    if (!type.startsWith("tool-") && type !== "dynamic-tool") return;
    const id = toolCallIdOf(p);
    if (!id) return;
    const rank = toolPartRank(p);
    const seen = winner.get(id);
    if (!seen) {
      winner.set(id, { part: p, rank, first: index });
      return;
    }
    if (rank >= seen.rank) {
      winner.set(id, { part: p, rank, first: seen.first });
    }
  });
  if (winner.size === 0) return parts;
  const out: T[] = [];
  parts.forEach((p, index) => {
    const type = (p as { type?: unknown }).type;
    const id =
      typeof type === "string" &&
      !APPROVAL_PAIR_TYPES.has(type) &&
      (type.startsWith("tool-") || type === "dynamic-tool")
        ? toolCallIdOf(p)
        : undefined;
    if (!id) {
      out.push(p);
      return;
    }
    const entry = winner.get(id);
    if (!entry) {
      out.push(p);
      return;
    }
    if (entry.first === index) out.push(entry.part);
  });
  return out;
};

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
  return dedupeToolParts(out);
}