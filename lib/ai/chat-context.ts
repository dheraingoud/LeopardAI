// leopard · durable per-chat context — the rules that decide which turns get
// folded into a rolling summary and how the replayed summary is assembled.
import { estimateJsonTokens, estimateTokens } from "../token-estimator";

export type ContextPart = {
  type?: string;
  text?: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

export type ContextMessage = {
  role?: string;
  parts?: unknown;
  content?: unknown;
  id?: string;
};

export type SummaryPart = {
  role: string;
  text: string;
};

export const SUMMARY_MAX_CHARS = 12000;

export const CONTEXT_RESERVE_TAIL = 6;

export const CONTEXT_KEEP_TOOL_OUTPUTS = 4;

const APPROVAL_PART_TYPES = new Set([
  "tool-approval-request",
  "tool-approval-response",
]);

export function messageParts(message: ContextMessage): ContextPart[] {
  if (Array.isArray(message.parts)) return message.parts as ContextPart[];
  if (Array.isArray(message.content)) return message.content as ContextPart[];
  return [];
}

export function messageText(message: ContextMessage): string {
  if (typeof message.content === "string") return message.content;
  return messageParts(message)
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text ?? "")
    .join("\n");
}

export function isToolPart(part: ContextPart | undefined): boolean {
  const type = part?.type;
  if (typeof type !== "string") return false;
  if (!type.startsWith("tool-")) return false;
  return !APPROVAL_PART_TYPES.has(type);
}

export function hasToolStructure(message: ContextMessage): boolean {
  return messageParts(message).some((p) => isToolPart(p));
}

export function isToolMessage(message: ContextMessage): boolean {
  return message.role === "tool";
}

export function isValidWindowStart(message: ContextMessage | undefined): boolean {
  if (!message) return true;
  if (isToolMessage(message)) return false;
  return !messageParts(message).some((p) => p?.type === "tool-result");
}

export function legalWindowStarts(messages: ContextMessage[]): boolean[] {
  const pending = new Set<string>();
  const starts: boolean[] = [];
  for (const message of messages) {
    starts.push(pending.size === 0 && isValidWindowStart(message));
    for (const part of messageParts(message)) {
      if (part?.type === "tool-call" && part.toolCallId) pending.add(part.toolCallId);
      if (part?.type === "tool-result" && part.toolCallId) pending.delete(part.toolCallId);
    }
  }
  return starts;
}

export type LiveWindow = {
  live: ContextMessage[];
  watermarkValid: boolean;
};

export function resolveLiveWindow(
  messages: ContextMessage[],
  summarizedThroughId: string | undefined,
): LiveWindow {
  if (!summarizedThroughId) return { live: messages, watermarkValid: true };
  const idx = messages.findIndex((m) => m.id === summarizedThroughId);
  if (idx < 0) return { live: messages, watermarkValid: false };
  return { live: messages.slice(idx + 1), watermarkValid: true };
}

export type FoldPlan = {
  keep: ContextMessage[];
  folded: ContextMessage[];
  summaryParts: SummaryPart[];
  viable: boolean;
};

export function planFold(
  live: ContextMessage[],
  budgetTokens: number,
  estimate: (messages: ContextMessage[]) => number,
  reserveTail: number,
): FoldPlan {
  const minKeep = Math.max(1, reserveTail);
  const starts = legalWindowStarts(live);

  for (let start = 0; start <= live.length - minKeep; start += 1) {
    if (!starts[start]) continue;
    const keep = live.slice(start);
    if (estimate(keep) > budgetTokens) continue;
    const folded = live.slice(0, start);
    return { keep, folded, summaryParts: summaryPartsFor(folded), viable: true };
  }

  return { keep: live, folded: [], summaryParts: [], viable: false };
}

export function summaryPartsFor(prefix: ContextMessage[]): SummaryPart[] {
  const parts: SummaryPart[] = [];
  for (const message of prefix) {
    if (isToolMessage(message)) continue;
    const text = messageText(message).trim();
    if (!text) continue;
    parts.push({ role: message.role ?? "user", text });
  }
  return parts;
}

export function buildSummarySource(
  previousSummary: string | undefined,
  parts: SummaryPart[],
): string {
  const chunks: string[] = [];
  if (previousSummary?.trim()) {
    chunks.push(`SUMMARY SO FAR:\n${previousSummary.trim()}`);
  }
  for (const part of parts) {
    chunks.push(`${part.role.toUpperCase()}:\n${part.text}`);
  }
  return chunks.join("\n\n---\n\n");
}

export function extractiveSummary(
  previousSummary: string | undefined,
  parts: SummaryPart[],
): string {
  const userLines: string[] = [];
  const assistantLines: string[] = [];
  for (const part of parts) {
    const text = part.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (part.role === "user") userLines.push(text);
    else assistantLines.push(text);
  }
  const take = (lines: string[], maxChars: number) => {
    const out: string[] = [];
    let used = 0;
    for (const line of lines) {
      const clipped = line.length > maxChars ? `${line.slice(0, maxChars).trimEnd()}…` : line;
      if (used + clipped.length > maxChars) break;
      out.push(clipped);
      used += clipped.length;
    }
    return out;
  };
  const users = take(userLines, 4000);
  const assistants = take(assistantLines.slice(-6), 3000);
  const sections: string[] = [];
  if (previousSummary?.trim()) {
    sections.push(`SUMMARY SO FAR:\n${previousSummary.trim()}`);
  }
  if (users.length > 0) {
    sections.push(`REQUESTS:\n${users.map((l) => `- ${l}`).join("\n")}`);
  }
  if (assistants.length > 0) {
    sections.push(`LAST REPLIES:\n${assistants.map((l) => `- ${l}`).join("\n")}`);
  }
  if (sections.length === 0) return "";
  return `SUMMARY (extract fallback — the summarizer was unavailable):\n${sections.join("\n\n")}`;
}

export function clampSummary(summary: string): string {
  const trimmed = summary.trim();
  if (trimmed.length <= SUMMARY_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, SUMMARY_MAX_CHARS).trimEnd()}\n…(earlier detail trimmed)`;
}

export function summaryBlock(summary: string | undefined): string {
  const trimmed = summary?.trim();
  if (!trimmed) return "";
  return `EARLIER CONVERSATION (compacted — these turns were summarized to fit the context window):\n${trimmed}`;
}

export function notesBlock(notes: string | undefined): string {
  const trimmed = notes?.trim();
  if (!trimmed) return "";
  return `CONTEXT FOR THIS CHAT (written by the user — treat as standing instructions for this conversation):\n${trimmed}`;
}

export function toolOutputText(part: ContextPart): string {
  if (typeof part.output === "string") return part.output;
  if (part.output === undefined || part.output === null) {
    return typeof part.errorText === "string" ? part.errorText : "";
  }
  try {
    return JSON.stringify(part.output) ?? "";
  } catch {
    return "";
  }
}

export const CLEARED_TOOL_OUTPUT = "[tool result cleared to save context — re-run the tool if you need it again]";

export function clearToolOutputs(
  messages: ContextMessage[],
  keep: number,
): ContextMessage[] {
  const toolParts: Array<{ index: number; part: ContextPart }> = [];
  messages.forEach((message, index) => {
    for (const part of messageParts(message)) {
      if (isToolPart(part) && part.state === "output-available") {
        toolParts.push({ index, part });
      }
    }
  });
  const staleParts = new Set(
    toolParts.slice(0, Math.max(0, toolParts.length - keep)).map((t) => t.part),
  );
  if (staleParts.size === 0) return messages;
  return messages.map((message) => {
    const parts = messageParts(message);
    if (!parts.some((part) => staleParts.has(part))) return message;
    return {
      ...message,
      parts: parts.map((part) =>
        staleParts.has(part)
          ? { ...part, output: CLEARED_TOOL_OUTPUT }
          : part,
      ),
    };
  });
}

export function estimateContextTokens(messages: ContextMessage[]): number {
  let total = 0;
  for (const message of messages) {
    let text = "";
    let json = "";
    let images = 0;
    for (const part of messageParts(message)) {
      if (part?.type === "text" && typeof part.text === "string") text += part.text;
      else if (part?.type === "reasoning" && typeof part.text === "string") text += part.text;
      else if (part?.type === "file") images += 1;
      else if (isToolPart(part)) {
        text += toolOutputText(part);
        if (part.input !== undefined) {
          try {
            json += JSON.stringify(part.input) ?? "";
          } catch {
            json += "";
          }
        }
      }
    }
    total += estimateTokens(text) + estimateJsonTokens(json) + 4 + images * 85;
  }
  return total;
}
