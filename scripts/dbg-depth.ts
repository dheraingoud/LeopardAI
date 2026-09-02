// @ts-nocheck
import { chromium } from "playwright";
async function once(i) {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1400, height: 520 } })).newPage();
  let hit = false;
  p.on("console", (m) => {
    const t = m.text();
    if (t.includes("Maximum update depth")) { hit = true; console.log(`[run ${i}] CONSOLE:`, t); }
  });
  p.on("pageerror", (e) => { if (String(e).includes("Maximum update depth")) { hit = true; console.log(`[run ${i}] PAGEERROR:`, String(e.stack || e)); } });
  await p.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  const input = p.locator('[data-slot="composer-bar"] textarea');
  await input.waitFor({ timeout: 60_000 });
  await p.waitForTimeout(1200);
  await input.fill("Write a detailed 400-word essay about the history of the zebra. No lists, plain paragraphs.");
  await input.press("Enter");
  await p.waitForFunction(() => window.__chatStatus === "submitted" || window.__chatStatus === "streaming", undefined, { timeout: 30_000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const el = document.querySelector("div.flex-1.min-h-0.overflow-y-auto"); if (el) el.scrollTop = 0; });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const s = await p.evaluate(() => window.__chatStatus).catch(() => "?");
    if (s === "ready" || s === "error") break;
    await p.waitForTimeout(2000);
  }
  console.log(`[run ${i}] end status:`, await p.evaluate(() => window.__chatStatus), "depthHit:", hit);
  await b.close();
  return hit;
}
async function main() { for (let i = 1; i <= 4; i++) { if (await once(i)) break; } }
main().catch((e) => { console.error(e); process.exit(1); });
