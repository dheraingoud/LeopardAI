/**
 * Standalone verify for the P1.1 MCP tool-surface cap + P2.3 bound-memory prompt.
 * Run: cd next-frontend && npx tsx scripts/verify-bound.ts
 */
import assert from "node:assert";
import { maxMcpTools, isMcpToolAllowed } from "../lib/ai/mcp";
import { systemPrompt } from "../lib/ai/prompts";

let passed = 0;
const ok = (name: string): void => {
  passed += 1;
  console.log(`  ok  ${name}`);
};

// ── maxMcpTools (P1.1) ──────────────────────────────────────────────────────
console.log("maxMcpTools");
assert.strictEqual(maxMcpTools(undefined), 48, "default 48");
assert.strictEqual(maxMcpTools(""), 48, "empty → 48");
assert.strictEqual(maxMcpTools("100"), 100, "100 → 100");
assert.strictEqual(maxMcpTools("0"), 48, "0 → 48 (invalid)");
assert.strictEqual(maxMcpTools("abc"), 48, "non-numeric → 48");
assert.strictEqual(maxMcpTools("-3"), 48, "negative → 48");
assert.strictEqual(maxMcpTools("7.9"), 7, "decimal → floor 7");
ok("cap resolution (default + edge cases)");

// ── isMcpToolAllowed wildcards (P1.1) ───────────────────────────────────────
console.log("isMcpToolAllowed");
assert.strictEqual(isMcpToolAllowed("mcp__x__t", undefined), true, "unset allowlist → allow");
assert.strictEqual(isMcpToolAllowed("mcp__x__t", "mcp__x__t"), true, "exact match");
assert.strictEqual(isMcpToolAllowed("mcp__x__t", "mcp__y__*"), false, "different server → deny");
assert.strictEqual(isMcpToolAllowed("mcp__github__list_repos", "mcp__github__*"), true, "server wildcard");
assert.strictEqual(isMcpToolAllowed("mcp__github__list_repos", "mcp__github__list_*"), true, "prefix wildcard");
assert.strictEqual(isMcpToolAllowed("mcp__github__create_repo", "mcp__github__list_*"), false, "prefix mismatch");
ok("allowlist wildcard semantics");

// ── Memory-bound prompt (P2.3) ──────────────────────────────────────────────
console.log("systemPrompt memory bound");
const mk = (text: string, pinned: boolean, updatedAt: number) => ({ id: text, text, pinned, updatedAt });
const thirty = Array.from({ length: 30 }, (_, i) => mk(`fact ${i}`, i < 10, 1000 + i));
const out = systemPrompt({ supportsTools: false, memories: thirty });
const mheader = "THINGS YOU REMEMBER ABOUT THE USER (persistent, cross-chat)";
assert.ok(out.includes(mheader), "memory block present");
const block = out.slice(out.indexOf(mheader));
const bullets = block.split("\n").filter((l) => l.startsWith("- "));
assert.ok(bullets.length <= 24, `at most 24 bullets, got ${bullets.length}`);
// pinned (facts 0..9) must ALL survive; only newest 14 of the rest kept.
const pinnedLines = bullets.filter((l) => /fact [0-9]\b/.test(l));
assert.strictEqual(pinnedLines.length, 10, "all 10 pinned facts kept");
const newestKept = bullets.filter((l) => /fact (1[6-9]|2[0-9])/.test(l));
assert.strictEqual(newestKept.length, 14, "14 newest unpinned kept (facts 16..29)");
assert.ok(block.includes("and 6 older"), "omission note present for 6 dropped unpinned");
ok(`memory bound: ${bullets.length} bullets, pinned=${pinnedLines.length}, newest=${newestKept.length}, omission note`);
const noMem = systemPrompt({ supportsTools: false });
assert.ok(!noMem.includes("THINGS YOU REMEMBER"), "no memory block when none provided");
ok("no memories → no memory block");

console.log(`\nPASS ${passed} assertions`);