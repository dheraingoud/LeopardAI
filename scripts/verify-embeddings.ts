/**
 * Standalone verify for lib/ai/embeddings.ts (Φ-semantic, no live model/network).
 * Run: cd next-frontend && npx tsx scripts/verify-embeddings.ts
 */
import assert from "node:assert";
import {
  EMBED_MODEL_DEFAULT,
  cosineSimilarity,
  embedTextsDeps,
  isSemanticMemoryEnabled,
  normalizeVector,
  rankMemoriesByQuery,
  type EmbeddableMemory,
} from "../lib/ai/embeddings";

let passed = 0;
const ok = (n: string): void => {
  passed += 1;
  console.log(`  ok  ${n}`);
};

async function main(): Promise<void> {
console.log("embeddings basics");
assert.deepStrictEqual(EMBED_MODEL_DEFAULT, "baai/bge-m3", "default model");

const norm = normalizeVector([3, 4]);
assert.ok(Math.abs(norm[0] - 0.6) < 1e-9 && Math.abs(norm[1] - 0.8) < 1e-9, "3,4 → 0.6,0.8");
assert.deepStrictEqual(normalizeVector([]), [], "empty → []");

assert.ok(Math.abs(cosineSimilarity(normalizeVector([3, 4]), normalizeVector([3, 4])) - 1) < 1e-9, "identical → ~1");
assert.ok(cosineSimilarity(normalizeVector([3, 4]), normalizeVector([-3, -4])) < -0.99, "opposite → ~ -1");
assert.ok(Math.abs(cosineSimilarity(normalizeVector([1, 0, 0]), normalizeVector([0, 1, 0]))) < 1e-12, "orthogonal → ~0");
const mismatched = cosineSimilarity([1, 2, 3], [4, 5]);
assert.ok(Number.isFinite(mismatched), "length mismatch → finite (min length)");
ok("normalize + cosine math");

console.log("isSemanticMemoryEnabled (env-gated/fail-closed)");
const prevFlag = process.env.LEOPARD_SEMANTIC_MEMORY;
const prevKey = process.env.NVIDIA_API_KEY;
const setEnv = (flag: string | undefined, key: string | undefined) => {
  if (flag === undefined) delete process.env.LEOPARD_SEMANTIC_MEMORY;
  else process.env.LEOPARD_SEMANTIC_MEMORY = flag;
  if (key === undefined) delete process.env.NVIDIA_API_KEY;
  else process.env.NVIDIA_API_KEY = key;
};
setEnv(undefined, undefined);
assert.strictEqual(isSemanticMemoryEnabled(), false, "unset → off");
setEnv("1", undefined);
assert.strictEqual(isSemanticMemoryEnabled(), false, "flag but no key → off");
setEnv("1", "nvapi-test");
assert.strictEqual(isSemanticMemoryEnabled(), true, "flag + key → on");
setEnv("0", "nvapi-test");
assert.strictEqual(isSemanticMemoryEnabled(), false, "key but flag=0 → off");
ok("gating");

console.log("embedTextsDeps (DI fetch, no network)");
const fakeFetch = (async () => ({
  ok: true,
  status: 200,
  text: async () => "",
  json: async () => ({ data: [{ embedding: [3, 4] }, { embedding: [1, 1] }] }),
})) as unknown as typeof fetch;
const vecs = await embedTextsDeps(["a", "b"], {
  apiKey: "k",
  model: "m",
  baseUrl: "https://nope/v1/embeddings",
  fetchImpl: fakeFetch,
});
assert.strictEqual(vecs.length, 2, "one vector per input");
assert.ok(Math.abs(Math.hypot(vecs[0][0], vecs[0][1]) - 1) < 1e-9, "output L2-normalized");
// failing fetch → throws (caller falls back)
let threw = false;
try {
  await embedTextsDeps(["x"], { apiKey: "k", fetchImpl: (async () => ({ ok: false, status: 503, text: async () => "boom" })) as unknown as typeof fetch });
} catch {
  threw = true;
}
assert.ok(threw, "HTTP failure throws");
// empty input → []
assert.deepStrictEqual(await embedTextsDeps([], { apiKey: "k" }), [], "empty → []");
ok("DI fetch path");

console.log("rankMemoriesByQuery");
const mem = (id: string, pin: boolean, sim: number | undefined, ts = 10): EmbeddableMemory => ({
  id,
  text: id,
  pinned: pin,
  updatedAt: ts,
  ...(sim !== undefined ? { embedding: normalizeVector([sim, 1]) } : {}),
});
const q = normalizeVector([10, 1]); // higher first-coord → higher sim
const rows: EmbeddableMemory[] = [
  mem("low", false, 0.2),
  mem("pinnedOld", true, 0.9, 5),
  mem("high", false, 0.9),
  mem("noEmb", false, undefined),
  mem("pinnedNew", true, 0.1, 20),
];
const ranked = rankMemoriesByQuery(q, rows);
const ids = ranked.map((m) => m.id);
assert.strictEqual(ids[0], "pinnedNew", "newest pinned first");
assert.strictEqual(ids[1], "pinnedOld", "older pinned second");
const rest = ids.slice(2);
assert.strictEqual(rest[0], "high", "highest-sim unpinned floats up");
assert.strictEqual(rest[rest.length - 1], "noEmb", "no-embedding sinks last");
assert.strictEqual(ranked.length, rows.length, "full set returned (bounding done by caller)");
ok("ranking (pinned→sim→sink)");

process.env.LEOPARD_SEMANTIC_MEMORY = prevFlag;
process.env.NVIDIA_API_KEY = prevKey;

console.log(`\nPASS ${passed} assertions`);
}

main().catch((err) => {
  console.error("EMBEDDINGS VERIFY FAIL:", err?.message ?? err);
  process.exit(1);
});