import { chromium } from "playwright";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Usage readout: open the most recent chat that HAS messages and check the
// token/context readout renders somewhere in the UI.
async function main() {
  const c = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  (c as any).setAdminAuth(process.env.CONVEX_DEPLOY_KEY!);
  const chats = (await c.query(api.chats.list as never, { userId: "leopard-dev-test-user-0001" } as never)) as any[];
  const sorted = [...chats].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  let target: string | null = null;
  for (const chat of sorted.slice(0, 10)) {
    const rows = (await c.query(api.messages.list as never, { chatId: chat._id } as never)) as any[];
    if (rows.length > 0) { target = chat._id; break; }
  }
  if (!target) {
    console.log(JSON.stringify({ usageLine: null, reason: "no chat with messages" }));
    return;
  }
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto(`http://localhost:3001/chat/${target}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(4000);
  // The readout's trigger shows just the compact number; "tokens · N turns"
  // lives inside the popover — open it before reading.
  const trigger = p.locator("[aria-label='Chat usage details']").first();
  const hasTrigger = await trigger.isVisible().catch(() => false);
  if (hasTrigger) {
    await trigger.click();
    await p.waitForTimeout(800);
  }
  const txt = await p.evaluate(() => document.body.innerText);
  const m = txt.match(/[^\n]*tokens?[^\n]*/i);
  console.log(JSON.stringify({ chatId: target, hasTrigger, usageLine: m?.[0]?.trim() ?? null }));
  await b.close();
}
void main();
