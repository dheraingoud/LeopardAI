import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: "shots/reload-1.png", clip: { x: 380, y: 20, width: 520, height: 420 } });
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: "shots/reload-2.png", clip: { x: 380, y: 20, width: 520, height: 420 } });
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.waitForTimeout(2500);
  await p.screenshot({ path: "shots/reload-3.png", clip: { x: 380, y: 20, width: 520, height: 420 } });
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
