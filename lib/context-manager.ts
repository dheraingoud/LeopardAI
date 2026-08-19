import { estimateMessageTokens, getContextBudget, type TokenMessage } from "./token-estimator";

export type ContextStrategy = "sliding-window" | "summarize" | "priority";

/** Clamp the auto-compact fill threshold to a sane band. Read from
 * LEOPARD_CONTEXT_COMPACT_AT by callers; mirrors `/autocompact <tokens>` in
 * spirit — earlier/later auto-compaction per model rather than a hardcoded 85%. */
export function clampCompactThreshold(value: number): number {
  if (!Number.isFinite(value)) return 0.85;
  return Math.min(0.95, Math.max(0.5, value));
}

export interface CompactionResult {
  messages: TokenMessage[];
  summary?: string;
  droppedCount: number;
  originalTokenCount: number;
  compactedTokenCount: number;
  strategy: ContextStrategy;
}

export function applySlidingWindow(
  messages: TokenMessage[],
  budget: number,
  reserveLastN = 4,
): CompactionResult {
  const originalTokenCount = messages.reduce((s, m) => s + estimateMessageTokens(m), 0);

  if (originalTokenCount <= budget) {
    return {
      messages,
      droppedCount: 0,
      originalTokenCount,
      compactedTokenCount: originalTokenCount,
      strategy: "sliding-window",
    };
  }

  // Always keep the last N messages
  const tail = messages.slice(-reserveLastN);
  const tailTokens = tail.reduce((s, m) => s + estimateMessageTokens(m), 0);
  const remainingBudget = Math.max(0, budget - tailTokens);

  const head = messages.slice(0, -reserveLastN);
  const selected: TokenMessage[] = [];
  let used = 0;

  for (let i = head.length - 1; i >= 0; i--) {
    const tokens = estimateMessageTokens(head[i]);
    if (used + tokens <= remainingBudget) {
      selected.unshift(head[i]);
      used += tokens;
    }
  }

  const compacted = [...selected, ...tail];
  const droppedCount = messages.length - compacted.length;
  const compactedTokenCount = compacted.reduce((s, m) => s + estimateMessageTokens(m), 0);

  return {
    messages: compacted,
    droppedCount,
    originalTokenCount,
    compactedTokenCount,
    strategy: "sliding-window",
  };
}

/** Contract for a summarizer the caller injects (DI). Returns the folded summary
 * text, or undefined to signal summarization failed (caller then degrades to a
 * sliding window). `focus` carries an optional user directive — mirror of Claude
 * Code's `/compact <focus>` — telling the summarizer what to prioritize keeping. */
export type Summarizer = (
  messages: TokenMessage[],
  focus?: string,
) => Promise<string | undefined>;

/** Browser-fetch summarizer, kept only for downward compatibility with callers
 * running in a browser context. Server callers (the chat route) inject a
 * server-side summarizer instead — a browser-relative fetch cannot reach the
 * route from Node, so the default must NOT be used by the route. */
const defaultBrowserSummarizer: Summarizer = async (messages, focus) => {
  const res = await fetch("/api/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, focus }),
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { summary?: string };
  return data.summary;
};

export async function applySummarizeStrategy(
  messages: TokenMessage[],
  budget: number,
  opts?: { summarize?: Summarizer; focus?: string },
): Promise<CompactionResult> {
  const originalTokenCount = messages.reduce((s, m) => s + estimateMessageTokens(m), 0);

  if (originalTokenCount <= budget) {
    return {
      messages,
      droppedCount: 0,
      originalTokenCount,
      compactedTokenCount: originalTokenCount,
      strategy: "summarize",
    };
  }

  // Find how many from the front we need to compress
  // Target: compress oldest 60% of messages into a summary
  const splitIndex = Math.ceil(messages.length * 0.6);
  const toSummarize = messages.slice(0, splitIndex);
  const toKeep = messages.slice(splitIndex);

  let summary: string | undefined;

  try {
    summary = await (opts?.summarize ?? defaultBrowserSummarizer)(toSummarize, opts?.focus);
  } catch {
    // If summarization fails, fall through to sliding window
  }

  if (!summary) {
    return applySlidingWindow(messages, budget);
  }

  const summaryMessage: TokenMessage = {
    role: "system",
    content: `[Previous conversation summary: ${summary}]`,
  };

  const compacted = [summaryMessage, ...toKeep];
  const compactedTokenCount = compacted.reduce((s, m) => s + estimateMessageTokens(m), 0);

  // If still over budget, apply sliding window on top
  if (compactedTokenCount > budget) {
    const further = applySlidingWindow(compacted, budget, 4);
    return {
      ...further,
      strategy: "summarize",
      summary,
    };
  }

  return {
    messages: compacted,
    summary,
    droppedCount: toSummarize.length - 1, // N messages replaced by 1 summary
    originalTokenCount,
    compactedTokenCount,
    strategy: "summarize",
  };
}

export function applyPriorityStrategy(
  messages: TokenMessage[],
  budget: number,
): CompactionResult {
  const originalTokenCount = messages.reduce((s, m) => s + estimateMessageTokens(m), 0);

  if (originalTokenCount <= budget) {
    return {
      messages,
      droppedCount: 0,
      originalTokenCount,
      compactedTokenCount: originalTokenCount,
      strategy: "priority",
    };
  }

  // Always keep the last user message
  const lastUserIdx = messages.findLastIndex((m) => m.role === "user");
  const lastUserMsg = lastUserIdx >= 0 ? messages[lastUserIdx] : null;

  const scored = messages
    .map((msg, i) => {
      let priority = 0;
      // Code-containing messages get highest priority
      if (/```[\s\S]*?```/.test(msg.content)) priority += 3;
      // File attachments
      if (msg.content.includes("[File:") || msg.content.includes("// File:")) priority += 2;
      // Short messages are more information-dense
      if (msg.content.length < 200) priority += 1;
      // Recent messages get a recency bonus
      priority += (i / messages.length) * 2;
      // The last user message gets max priority
      if (i === lastUserIdx) priority += 100;

      return { msg, i, tokens: estimateMessageTokens(msg), priority };
    })
    .sort((a, b) => b.priority - a.priority);

  const selected: typeof scored = [];
  let used = 0;

  for (const entry of scored) {
    if (used + entry.tokens <= budget) {
      selected.push(entry);
      used += entry.tokens;
    }
  }

  // Restore original order
  selected.sort((a, b) => a.i - b.i);

  const compacted = selected.map((e) => e.msg);
  const compactedTokenCount = compacted.reduce((s, m) => s + estimateMessageTokens(m), 0);
  const droppedCount = messages.length - compacted.length;

  // Ensure the last user message is always included
  if (lastUserMsg && !compacted.includes(lastUserMsg)) {
    compacted.push(lastUserMsg);
  }

  return {
    messages: compacted,
    droppedCount,
    originalTokenCount,
    compactedTokenCount,
    strategy: "priority",
  };
}

export function compactMessages(
  messages: TokenMessage[],
  contextWindow: number,
  strategy: ContextStrategy = "sliding-window",
  opts?: { summarize?: Summarizer; focus?: string },
): Promise<CompactionResult> | CompactionResult {
  const budget = getContextBudget(contextWindow);

  switch (strategy) {
    case "summarize":
      return applySummarizeStrategy(messages, budget, opts);
    case "priority":
      return applyPriorityStrategy(messages, budget);
    default:
      return applySlidingWindow(messages, budget);
  }
}
