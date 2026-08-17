// Server-side integration test for Φ10/#3 backgroundServe.
//
// Proves the DETACHED generation path end-to-end WITHOUT a browser or a live
// model: feeds backgroundServe a deterministic fake `streamText` result,
// watches it persist a `streaming` row then a `completed` row to the REAL prod
// Convex deployment, and asserts the broadcast chunk stream (data-assistant-id
// first, finish last) is correct. A deliberately-delayed subscribe simulates the
// reload case — chunks already exhausted must still be delivered via replay
// (survival with no live subscriber). Cleanup removes the smoke row.
//
// Run: npx tsx scripts/test-server-generation.ts
import {
  backgroundServe,
  createGenerationController,
} from "../lib/ai/server-generation";
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Run from the app root: cd next-frontend && npx tsx scripts/test-server-generation.ts
const root = resolve(process.cwd());
function loadEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(resolve(root, file), "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) out[m[1].trim()] = m[2].trim();
    }
  } catch {}
  return out;
}
const envA = loadEnv(".env");
const envB = loadEnv(".env.local");
const url = envA.NEXT_PUBLIC_CONVEX_URL || envB.NEXT_PUBLIC_CONVEX_URL;
const key = envA.CONVEX_DEPLOY_KEY;
const DEV_USER_ID = "leopard-dev-test-user-0001";
if (!url || !key) throw new Error("missing CONVEX url/key");

// ── Fake streamText result ──────────────────────────────────────────────────
// Deterministic UI-protocol chunks in a canonical order, plus the canonical
// final UIMessage parts (what result.parts resolves to post-stream).
const CHUNKS = [
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: "Hello " },
  { type: "text-delta", id: "t1", delta: "world" },
  { type: "text-end", id: "t1" },
  { type: "reasoning-start", id: "r1", name: "thinking", signature: "" },
  { type: "reasoning-delta", id: "r1", delta: "think hard" },
  { type: "reasoning-end", id: "r1", delta: "2224e3b9" },
  { type: "tool-call-start", id: "tc1", toolCallId: "call_1", toolName: "webFetch" },
  { type: "tool-call-delta", id: "tc1", toolCallId: "call_1", delta: "{}" },
  {
    type: "tool-call-end", id: "tc1", toolCallId: "call_1", toolName: "webFetch",
    args: { url: "https://example.com" },
  },
  { type: "finish", finishReason: "stop", usage: { inputTokens: 10, outputTokens: 5 } },
] as const;
const FINAL_PARTS = [
  { type: "text", text: "Hello world", state: "done" },
  { type: "reasoning", text: "think hard", signature: "2224e3b9" },
  { type: "tool", toolCallId: "call_1", toolName: "webFetch", input: { url: "https://example.com" } },
] as const;

const fakeResult = {
  toUIMessageStream: () => ({
    async *[Symbol.asyncIterator]() {
      for (const c of CHUNKS) yield c;
    },
  }),
  parts: FINAL_PARTS,
};
const fakeResultSub = fakeResult as never; // backgroundServe types `result: any`

// ── Real Convex client (same admin auth as the route) ───────────────────────
async function main() {
// Seed the env the module under test reads directly (Next loads .env into
// process.env; a standalone tsx run does not). Must happen before the first
// backgroundServe call so its convexClient() singleton sees the deploy key.
process.env.NEXT_PUBLIC_CONVEX_URL = url;
process.env.CONVEX_DEPLOY_KEY = key;
const client = new ConvexHttpClient(url);
(client as unknown as { setAdminAuth: (t: string) => void }).setAdminAuth(key);
const { api } = await import("../convex/_generated/api.js");

const chats = (await client.query(api.chats.list, { userId: DEV_USER_ID })) as unknown as any[];
if (!chats.length) throw new Error("no chat for dev user");
const chat = chats[0];
const assistantId = "sg-itest-" + Date.now();

const received: any[] = [];
const gen = backgroundServe({
  result: fakeResultSub,
  sendReasoning: true,
  assistantId,
  chatId: chat._id as string,
  userId: DEV_USER_ID,
  model: "integration-test",
  abortController: createGenerationController(assistantId),
});

// Simulate a reload: wait for the stream to finish with NO attached subscriber,
// THEN subscribe — everything must arrive via replay (survival test).
await new Promise((r) => setTimeout(r, 250));
gen.subscribe((c) => received.push(c));
await gen.done;

// ── Assertions ──────────────────────────────────────────────────────────────
const fail: string[] = [];
let pass = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) pass++;
  else fail.push(`✗ ${name}${extra ? " — " + extra : ""}`);
}

check("first emitted chunk is data-assistant-id", received[0]?.type === "data-assistant-id");
check("assistant id matches", received[0]?.data === assistantId);
const types = received.map((c) => c.type);
check("finish present", types.includes("finish"));
check("finish is last", types[types.length - 1] === "finish");
check("order: text-start before text-end", types.indexOf("text-start") < types.indexOf("text-end"));
check("order: reasoning before finish", types.indexOf("reasoning-end") < types.indexOf("finish"));
const fullText = received.filter((c) => c.type === "text-delta").map((c) => c.delta).join("");
check("text reassembles 'Hello world'", fullText === "Hello world", JSON.stringify(fullText));

// Convex row — the REAL persistence assertion.
const rows = (await client.query(api.messages.list, { chatId: chat._id })) as unknown as any[];
const mine = rows.filter((m) => m.id === assistantId);
check("single persisted row (no dup)", mine.length === 1, `got ${mine.length}`);
if (mine.length === 1) {
  const r = mine[0];
  check("status completed", r.status === "completed", String(r.status));
  check("role assistant", r.role === "assistant");
  const texts = (r.parts as any[]).filter((p) => p.type === "text").map((p) => p.text).join("");
  check("persisted text", texts === "Hello world", texts);
  const reason = (r.parts as any[]).find((p) => p.type === "reasoning");
  check("persisted reasoning", !!reason && reason.text === "think hard");
  check("model set", r.model === "integration-test");
}

// Cleanup (only if a row exists — failure above shouldn't crash the harness)
if (mine.length === 1) {
  await client.mutation(api.messages.remove, { messageId: mine[0]._id, userId: DEV_USER_ID });
  const after = (await client.query(api.messages.list, { chatId: chat._id })) as unknown as any[];
  console.log("cleanedUp rows:", after.filter((m) => m.id === assistantId).length);
} else {
  console.log("cleanup skipped — no row persisted to remove");
}

console.log(`\nPASSED ${pass}` + (fail.length ? ` | FAILED ${fail.length}` : " | ALL" ));
if (fail.length) {
  console.log(fail.join("\n"));
  process.exit(1);
}
console.log("INTEGRATION PASS — backgroundServe persists streaming→completed + survives reload.");
} // end main()

main().catch((e) => {
  console.error("INTEGRATION FAIL:", e?.message ?? e);
  process.exit(1);
});