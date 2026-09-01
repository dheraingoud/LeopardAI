// @ts-nocheck
import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  const t0 = Date.now();
  const stamp = (l: string) => console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, l);
  page.on("console", (m) => m.type() === "error" && stamp(`[err] ${m.text().slice(0, 400)}`));
  page.on("framenavigated", (f) => f === page.mainFrame() && stamp(`[NAV] ${f.url()}`));
  page.on("requestfailed", (r) => stamp(`[reqfail] ${r.url().slice(-20)} ${r.failure()?.errorText}`));
  page.on("pageerror", (e) => stamp(`[pageerror] ${String(e).slice(0, 500)}`));
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill("Use a team of subagents for this: research the latest Next.js caching changes, then write a short summary, then have another agent verify it. Use spawn_agents.");
  await page.keyboard.press("Enter");
  stamp("sent");
  const card = page.locator('[data-slot="approval-card"]');
  await card.waitFor({ timeout: 120_000 });
  stamp("approval visible");
  await card.locator('button:has-text("Allow")').click();
  stamp("clicked Allow");
  const runCard = page.locator('[data-slot="agent-run-card"]');
  await runCard.waitFor({ timeout: 60_000 });
  stamp("run card visible — expanding");
  await runCard.locator("button").first().click();
  stamp("expand clicked — passive 40s");
  for (let i = 0; i < 8; i++) await page.waitForTimeout(5000);
  stamp("still alive");
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
