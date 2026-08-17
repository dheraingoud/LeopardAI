// Server-side smoke for Φ10/#3: prove api.messages.upsertAssistant creates,
// patches idempotently (single row), and respects owner checks. Uses the SAME
// admin ConvexHttpClient auth the route's server-generation module uses.
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

// 1. Find the newest chat owned by the dev user.
const chats = await client.query(api.chats.list, { userId: DEV_USER_ID });
if (!chats.length) throw new Error("no chat for dev user — nothing to attach smoke to");
const chat = chats[0];
console.log("chat:", chat._id, "ownedBy:", chat.userId);

const aid = "smoke-assistant-" + Date.now();
const base = { chatId: chat._id, userId: DEV_USER_ID, id: aid };

// 2. Create (streaming placeholder).
const r1 = await client.mutation(internal.messages.upsertAssistant, {
  ...base, model: "smoke-model", parts: [{ type: "text", text: "" }], status: "streaming",
});
console.log("CREATE ->", JSON.stringify(r1));

// 3. Patch (same id, filled parts, completed).
const r2 = await client.mutation(internal.messages.upsertAssistant, {
  ...base, parts: [{ type: "text", text: "hello world" }], status: "completed",
});
console.log("PATCH  ->", JSON.stringify(r2), "sameRow:", r1.updated === false && r2.updated === true);

// 4. Confirm exactly one row for that id, status/parts settled.
const msgs = await client.query(api.messages.list, { chatId: chat._id });
const found = msgs.filter((m) => m.id === aid);
console.log("rowsForSmokeId:", found.length);
if (found.length !== 1) throw new Error("FAIL: expected exactly 1 row");
const row = found[0];
console.log("status:", row.status, "| parts:", JSON.stringify(row.parts), "| model:", row.model, "| role:", row.role);

// 5. Ownership enforcement: wrong user must be REFUSED.
let refused = false;
try {
  await client.mutation(internal.messages.upsertAssistant, {
    ...base, userId: "someone-who-does-not-own-this", parts: [{ type: "text", text: "x" }],
  });
} catch (e) {
  refused = true;
  console.log("ownerCheck: refused (expected) ->", String(e?.message ?? e).slice(0, 60));
}
if (!refused) throw new Error("FAIL: owner check did not block a foreign userId");

// 6. Cleanup — delete the smoke row.
await client.mutation(api.messages.remove, { messageId: row._id, userId: DEV_USER_ID });
const after = await client.query(api.messages.list, { chatId: chat._id });
console.log("cleanedUp rowsForSmokeId:", after.filter((m) => m.id === aid).length);

console.log("\nSMOKE PASS");