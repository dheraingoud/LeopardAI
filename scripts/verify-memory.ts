// Φ-docs · per-user memory verify — pure logic that doesn't need a live Convex:
//   (1) systemPrompt renders the memory block only when memories are supplied,
//       lists each fact, and floats pinned facts first;
//   (2) normalizeMemoryKey dedupes facts correctly (case/whitespace/punct);
//   (3) memoryTools() exposes the expected `memory_*` keys the route's
//       auto-approve gate matches on.
// The Convex round-trip (remember→inject) is exercised against a live backend
// by the user's convex deploy; this covers the pure string/steering contracts.
//
// Run: cd next-frontend && npx tsx scripts/verify-memory.ts
import { systemPrompt } from "../lib/ai/prompts";
import { normalizeMemoryKey } from "../convex/userMemory";
import { memoryTools } from "../lib/ai/tools/memory";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}${extra ? " — " + extra : ""}`);
  }
};

function render(memories?: Array<{ text: string; pinned?: boolean }>) {
  return systemPrompt({ requestHints: {}, supportsTools: false, contexts: undefined, ...(memories ? { memories } : {}) } as any);
}

function main() {
  // (1) prompt block
  const noMem = render(undefined);
  check("prompt: no block when no memories", !/THINGS YOU REMEMBER/.test(noMem));

  const withMem = render([
    { text: "  prefers dark mode  " },
    { text: "lives in Lisbon" },
  ]);
  const P = "THINGS YOU REMEMBER ABOUT THE USER";
  check("prompt: block present when memories supplied", withMem.includes(P));
  check("prompt: lists fact 1", withMem.includes("- prefers dark mode"));
  check("prompt: trimmed fact", withMem.includes("- lives in Lisbon"));
  check("prompt: not the raw padded text", !withMem.includes("-   prefers"));

  // pinned floats first
  const pinned = render([
    { text: "loves espresso" },
    { text: "allergic to peanuts", pinned: true },
  ]);
  const idxPinned = pinned.indexOf("- allergic to peanuts");
  const idxOther = pinned.indexOf("- loves espresso");
  check("prompt: pinned fact appears before unpinned", idxPinned >= 0 && idxPinned < idxOther);

  // (2) dedupe key
  check("key: case-insensitive", normalizeMemoryKey("Dark mode") === normalizeMemoryKey("dark mode"));
  check("key: whitespace collapsed", normalizeMemoryKey("  a   b  ") === normalizeMemoryKey("a b"));
  check("key: trims", normalizeMemoryKey("  hi  ") === normalizeMemoryKey("hi"));
  check("key: punct glued", normalizeMemoryKey("ok !") === normalizeMemoryKey("ok!"));

  // (3) tool keys match the route auto-approve prefix
  const tools = memoryTools({ userId: "u1" });
  const keys = Object.keys(tools);
  check("tools: three memory tools", keys.length === 3, keys.join(","));
  check("tools: all prefixed memory_", keys.every((k) => k.startsWith("memory_")), keys.join(","));
  check("tools: remember present", keys.includes("memory_remember"));
  check("tools: list present", keys.includes("memory_list"));
  check("tools: forget present", keys.includes("memory_forget"));

  console.log(`\nmemory (pure): ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main();