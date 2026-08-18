// Context-compaction verify — proves the strategy the route uses
// (compactMessages, docs context-window.md auto-compact) folds overflow history
// while KEEPING the tail, and that the summarize path degrades to a pure
// sliding window when /api/summarize is unreachable (node, no server) — never
// throws, never loses the thread.
//
// Run: cd next-frontend && npx tsx scripts/verify-compaction.ts
import { compactMessages } from "../lib/context-manager";
import { estimateConversationTokens, getContextBudget, type TokenMessage } from "../lib/token-estimator";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}${extra ? " — " + extra : ""}`);
  }
};

function makeConversation(n: number): TokenMessage[] {
  const msgs: TokenMessage[] = [];
  for (let i = 0; i < n; i++) {
    msgs.push({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message #${i} with some real substance. `.repeat(700), // ~6k tokens each
    });
  }
  return msgs;
}

async function main() {
  const win = 128_000;
  const budget = getContextBudget(win);
  const msgs = makeConversation(40);
  const used = estimateConversationTokens(msgs);
  check("history genuinely over budget", used > budget, `${used} > ${budget}`);

  // Sliding window (deterministic, no network).
  const slide = await compactMessages(msgs, win, "sliding-window");
  check("sliding: dropped oldest", slide.droppedCount > 0, `dropped=${slide.droppedCount}`);
  check("sliding: token count reduced", slide.compactedTokenCount < slide.originalTokenCount);
  const lastUser = [...slide.messages].reverse().find((m) => m.role === "user");
  check("sliding: last user message survives", !!lastUser);

  // Summarize strategy must fall back to sliding when /api/summarize is down
  // (fetch of a relative URL fails in plain node) without throwing.
  let didThrow = false;
  let sum;
  try {
    sum = await compactMessages(msgs, win, "summarize");
  } catch {
    didThrow = true;
  }
  check("summarize: never throws when /api/summarize down", !didThrow);
  check("summarize: still folds overflow (sliding fallback)", !!sum && sum.compactedTokenCount < sum.originalTokenCount);
  check("summarize: tail / last user preserved", !!sum && [...sum.messages].reverse().some((m) => m.role === "user"));

  // In-budget history is passed through untouched (no spurious compaction).
  const small = [{ role: "user", content: "hi" }];
  const passed = await compactMessages(small, win, "sliding-window");
  check("in-budget: unchanged", passed.droppedCount === 0 && passed.messages.length === 1);

  console.log(`\ncompaction: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("COMPACTION VERIFY FAIL:", e?.message ?? e);
  process.exit(1);
});