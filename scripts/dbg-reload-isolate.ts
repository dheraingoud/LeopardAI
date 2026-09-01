// @ts-nocheck
import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  const t0 = Date.now();
  const stamp = (l: string) => console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, l);
  page.on("console", (m) => ["error"].includes(m.type()) && stamp(`[${m.type()}] ${m.text().slice(0, 200)}`));
  page.on("framenavigated", (f) => f === page.mainFrame() && stamp(`[NAV] ${f.url()}`));
  page.on("requestfailed", (r) => stamp(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));
  page.on("pageerror", (e) => stamp(`[pageerror] ${String(e).slice(0, 300)}`));
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill("Use a team of subagents for this: research the latest Next.js caching changes, then write a short summary, then have another agent verify it. Use spawn_agents.");
  await page.keyboard.press("Enter");
  stamp("sent");
  const card = page.locator('[data-slot="approval-card"]');
  await card.waitFor({ timeout: 120_000 });
  stamp("approval visible");
  await page.screenshot({ path: "C:/tmp/iso-1.png" });
  await card.locator('button:has-text("Allow")').click();
  stamp("clicked Allow");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "C:/tmp/iso-2.png" });
  stamp("shot2 done");
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(5000);
    stamp(`alive, url=${page.url()}`);
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
