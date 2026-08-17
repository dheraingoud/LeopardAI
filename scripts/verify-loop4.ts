// L4 regression — model allowlist (LEOPARD_ENABLED_MODELS). Run: npx tsx scripts/verify-loop4.ts
import {
  parseModelAllowlist,
  isModelRequestAllowed,
} from "../lib/ai/model-allowlist";

let pass = 0;
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL ${label}: got ${a}, expected ${e}`);
  }
}

// parseModelAllowlist
eq(parseModelAllowlist(undefined), null, "parse unset → null");
eq(parseModelAllowlist(""), null, "parse empty → null");
eq(parseModelAllowlist("   "), null, "parse whitespace-only → null");
eq(
  Array.from(parseModelAllowlist("a, b , c") ?? []),
  ["a", "b", "c"],
  "parse CSV trims + splits",
);

const active = ["deepseek-ai/deepseek-v3-2", "glm-5.2"];

// no allowlist env → only active-membership gate
eq(isModelRequestAllowed("deepseek-ai/deepseek-v3-2", active, undefined), true, "active + no env → allowed");
eq(isModelRequestAllowed("unknown/id", active, undefined), false, "injected id + no env → rejected");
eq(isModelRequestAllowed("", active, undefined), false, "empty id → rejected");

// with allowlist env layered over active
eq(
  isModelRequestAllowed("deepseek-ai/deepseek-v3-2", active, "deepseek-ai/deepseek-v3-2,glm-5.2"),
  true,
  "active + listed → allowed",
);
eq(
  isModelRequestAllowed("glm-5.2", active, "deepseek-ai/deepseek-v3-2"),
  false,
  "active but not listed → rejected (operator-disabled)",
);
eq(
  isModelRequestAllowed("glm-5.2", active, "glm-5.2"),
  true,
  "listed + active → allowed",
);
eq(
  isModelRequestAllowed("not-in-active", active, "not-in-active"),
  false,
  "listed but not active → rejected (never reaches provider)",
);

console.log(`\nmodel-allowlist: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);