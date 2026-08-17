// L5 smoke — prove the tool-audit write path against Convex prod through the
// EXACT callsite the route uses (internal.audit.record via ConvexHttpClient +
// setAdminAuth, the server-generation pattern). The audit log is append-only;
// a successful insert commits a single labeled smoke row.
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

function loadEnv(file) {
  const out = {};
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
const DEV_USER_ID = url ? "leopard-dev-test-user-0001" : "";
if (!url || !key) throw new Error("missing CONVEX url/key");

const client = new ConvexHttpClient(url);
client.setAdminAuth(key);
const { api, internal } = await import("../convex/_generated/api.js");

// Attach to the newest dev-user chat (must exist — same fixture as smoke-upsert).
const chats = await client.query(api.chats.list, { userId: DEV_USER_ID });
if (!chats.length) throw new Error("no chat for dev user");
const chat = chats[0];

// Simulates the route's approval + tool-execution recording callsites.
const base = {
  chatId: chat._id,
  userId: DEV_USER_ID,
  assistantId: "smoke-assistant-" + Date.now(),
  ts: Date.now(),
};
const r1 = await client.mutation(internal.audit.record, {
  ...base,
  event: "approval",
  toolName: "smoke-audit",
  decision: "allow",
  reason: "read-only webSearch default",
});
console.log("APPROVAL INSERT -> committed", JSON.stringify(r1));

const r2 = await client.mutation(internal.audit.record, {
  ...base,
  event: "tool-execution",
  toolName: "smoke-audit",
  inputJson: '{"query":"unit-test-sentinel"}',
  outputSummary: "{}",
});
console.log("EXEC INSERT    -> committed", JSON.stringify(r2));

console.log("\nSMOKE PASS — audit write path live on prod (2 rows appended)");