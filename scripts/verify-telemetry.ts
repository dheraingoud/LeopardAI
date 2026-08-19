/**
 * Standalone verify for lib/ai/telemetry.ts (P2.4 cost feeder / P2.5 observability).
 * Run: cd next-frontend && npx tsx scripts/verify-telemetry.ts
 */
import assert from "node:assert";
import { estimateCostUsd, parseModelPricing } from "../lib/ai/telemetry";

let passed = 0;
const ok = (n: string): void => {
  passed += 1;
  console.log(`  ok  ${n}`);
};

const prev = process.env.LEOPARD_MODEL_PRICING;

const withPricing = <T,>(v: string | undefined, fn: () => T): T => {
  const old = process.env.LEOPARD_MODEL_PRICING;
  process.env.LEOPARD_MODEL_PRICING = v;
  try {
    return fn();
  } finally {
    if (old === undefined) delete process.env.LEOPARD_MODEL_PRICING;
    else process.env.LEOPARD_MODEL_PRICING = old;
  }
};

console.log("parseModelPricing");
assert.deepStrictEqual(parseModelPricing(undefined), {}, "unset → {}");
assert.deepStrictEqual(parseModelPricing("nope"), {}, "invalid json → {}");
assert.deepStrictEqual(parseModelPricing("[0,1]"), {}, "array → {}");
assert.deepStrictEqual(
  parseModelPricing('{"meta/llama-x": {"input": 0.2, "output": 0.6}}'),
  { "meta/llama-x": { input: 0.2, output: 0.6 } },
  "one entry",
);
assert.deepStrictEqual(
  parseModelPricing('{"a":{"input":1},"b":{"input":2,"output":3}}'),
  { b: { input: 2, output: 3 } },
  "invalid entries dropped",
);
ok("parse table (empty/invalid/valid)");

console.log("estimateCostUsd");
assert.strictEqual(withPricing(undefined, () => estimateCostUsd("m", 1000, 500)), undefined, "no pricing → undefined");
assert.strictEqual(
  withPricing('{"m":{"input":1,"output":2}}', () => estimateCostUsd("m", 1000, 500)),
  (1000 * 1 + 500 * 2) / 1_000_000,
  "cost = (in*pi + out*po)/1e6",
);
assert.strictEqual(
  withPricing('{"other":{"input":1,"output":2}}', () => estimateCostUsd("unknown-model", 1000, 500)),
  undefined,
  "unknown model → undefined",
);
assert.strictEqual(
  withPricing('{"meta/llama-*":{"input":1,"output":2}}', () =>
    estimateCostUsd("meta/llama-4-maverick", 1000, 500),
  ),
  (1000 * 1 + 500 * 2) / 1_000_000,
  "prefix `model*` match",
);
assert.strictEqual(
  withPricing('{"m":{"input":1,"output":2}}', () => estimateCostUsd("m", NaN, 500)),
  (0 * 1 + 500 * 2) / 1_000_000,
  "NaN input coerced to 0",
);
ok("cost math (exact + prefix + unknown + NaN)");

process.env.LEOPARD_MODEL_PRICING = prev;

console.log(`\nPASS ${passed} assertions`);