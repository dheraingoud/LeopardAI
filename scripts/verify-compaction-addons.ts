// Φ-docs addon B · summarize-compaction DI + focus + configurable threshold.
// Proves: the route-injected server summarizer is actually USED (produces a
// folded summary), `focus` reaches the summarizer, the auto-compact threshold is
// clamped, and a failing injected summarizer degrades to a sliding window
// without throwing or losing the tail. Pure (no network).
// Run: cd next-frontend && npx tsx scripts/verify-compaction-addons.ts
import {
  applySummarizeStrategy,
  clampCompactThreshold,
  compactMessages,
  type Summarizer,
} from "../lib/context-manager";
import { getContextBudget, type TokenMessage } from "../lib/token-estimator";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}${extra ? " — " + extra : ""}`);
  }
};

const msgs: TokenMessage[] = [];
for (let i = 0; i < 50; i++) {
  msgs.push({ role: i % 2 === 0 ? "user" : "assistant", content: `Message #${i} with some real substance and detailed code and decisions. `.repeat(350) });
}
const win = 128_000;
const budget = getContextBudget(win);

async function main() {
  // clampCompactThreshold band [0.5, 0.95]; NaN → 0.85.
  check("clamp NaN → 0.85", clampCompactThreshold(Number.NaN) === 0.85);
  check("clamp 0.3 → 0.5 (lower bound)", clampCompactThreshold(0.3) === 0.5);
  check("clamp 0.99 → 0.95 (upper bound)", clampCompactThreshold(0.99) === 0.95);
  check("clamp 0.85 → 0.85 (unchanged)", clampCompactThreshold(0.85) === 0.85);
  check("clamp 0.70 → 0.70 (passthrough)", clampCompactThreshold(0.7) === 0.7);

  // Injected summarizer IS used and receives focus.
  let sawFocus: string | undefined;
  const captured: string[] = [];
  const summarize: Summarizer = async (toFold, focus) => {
    sawFocus = focus;
    captured.push(`folded ${toFold.length} msgs`);
    return "FOCUSED SUMMARY of the older exchange.";
  };
  const res = await applySummarizeStrategy(msgs, budget, {
    summarize,
    focus: "keep the auth fix details",
  });
  check("injected summarizer called", captured.length === 1, captured.join());
  check("injected summarizer got the overflow chunk", /folded \d+ msgs/.test(captured[0] ?? ""));
  check("focus reached the summarizer", sawFocus === "keep the auth fix details", String(sawFocus));
  check("summary surfaced in result", res.summary === "FOCUSED SUMMARY of the older exchange.");
  check("compact token count reduced", res.compactedTokenCount < res.originalTokenCount);
  check("summary message injected", res.messages[0]?.content.includes("Previous conversation summary"));

  // compactMessages() threads the opts through the summarize strategy.
  const viaCompact = await compactMessages(msgs, win, "summarize", {
    summarize: async () => "COMPACT SUMMARY",
  });
  check("compactMessages: DI summaries", viaCompact.summary === "COMPACT SUMMARY");

  // Failing injected summarizer → sliding-window fallback, never throws, tail kept.
  let threw = false;
  let degraded;
  try {
    degraded = await compactMessages(msgs, win, "summarize", { summarize: async () => undefined });
  } catch {
    threw = true;
  }
  check("failing summarizer: never throws", !threw);
  check("failing summarizer: still folds (sliding fallback)", !!degraded && degraded.compactedTokenCount < degraded.originalTokenCount);
  check("failing summarizer: last user preserved", !!degraded && [...degraded.messages].reverse().some((m) => m.role === "user"));

  console.log(`\ncompaction-addons: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("COMPACTION-ADDONS VERIFY FAIL:", e?.message ?? e);
  process.exit(1);
});