/**
 * Standalone verify for lib/ai/fallback.ts (P1.2 model failover).
 * Run: cd next-frontend && npx tsx scripts/verify-fallback.ts
 * Asserts the error classifier + the fallback-chain builder.
 */
import assert from "node:assert";
import {
  buildFallbackModelChain,
  isFallbackableErrorText,
} from "../lib/ai/fallback";
import { allowedModelIds, getModelById, isImageModel, isVideoModel } from "../lib/ai/models";

let passed = 0;
const ok = (name: string): void => {
  passed += 1;
  console.log(`  ok  ${name}`);
};

// ── isFallbackableErrorText ────────────────────────────────────────────────
console.log("isFallbackableErrorText");
const hard = [
  "500 Internal Server Error",
  "502 Bad Gateway",
  "503 Service Unavailable",
  "ECONNRESET: socket hang up",
  "The upstream node timed out",
  "fetch failed",
  "Generation produced no output.",
  "",
];
for (const msg of hard) {
  assert.strictEqual(isFallbackableErrorText(msg), true, `should fallback on: "${msg}"`);
  ok(`hard → true: "${msg || "<empty>"}"`);
}
const soft = [
  "401 unauthorized",
  "403 Forbidden",
  "429 Too Many Requests: rate limit",
  "The selected model's API key is not configured",
  "invalid request",
  "payment / credit card required",
  "model_not_allowed",
];
for (const msg of soft) {
  assert.strictEqual(isFallbackableErrorText(msg), false, `should NOT fallback on: "${msg}"`);
  ok(`soft → false: "${msg}"`);
}
// Error-object + unknown shapes
assert.strictEqual(isFallbackableErrorText(new Error("503")), true);
ok("Error object (503) → true");
assert.strictEqual(isFallbackableErrorText({ message: "401" }), false);
ok("{message:'401'} → false");
assert.strictEqual(isFallbackableErrorText(undefined), true);
ok("undefined → true");

// ── buildFallbackModelChain ─────────────────────────────────────────────────
console.log("buildFallbackModelChain");
const textModels = [...allowedModelIds].filter(
  (id) => !isImageModel(id) && !isVideoModel(id) && getModelById(id),
);
assert.ok(textModels.length > 0, "expected ≥1 active text model");
const primary = textModels[0];

const chain = buildFallbackModelChain(primary, { max: 2 });
assert.strictEqual(chain[0], primary, "chain starts at requested id");
assert.ok(chain.length >= 1 && chain.length <= 2, `chain length ${chain.length} within [1,2]`);
assert.strictEqual(new Set(chain).size, chain.length, "no duplicate ids in chain");
for (const id of chain) {
  assert.ok(!isImageModel(id) && !isVideoModel(id), `chain id ${id} is a text model`);
  assert.ok(getModelById(id), `chain id ${id} resolves`);
}
ok(`primary-first, length ${chain.length}, text-only, distinct`);
if (chain.length === 2) {
  const second = getModelById(chain[1]);
  assert.ok(second, "second model resolves");
  const first = getModelById(primary);
  assert.ok(first && second && second.provider === first.provider, "second is same-provider sibling");
  ok(`fallback = same-provider sibling: ${chain[1]}`);
} else {
  ok("single-model chain (only one usable text model in registry)");
}

// max clamp
const chain3 = buildFallbackModelChain(primary, { max: 99 });
assert.ok(chain3.length <= textModels.length, "never more ids than usable text models");
assert.ok(chain3.length < 99, "never exceeds requested cap");
ok(`max:99 clamped to ${chain3.length}`);

console.log(`\nPASS ${passed} assertions`);