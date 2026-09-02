// @ts-nocheck — dump the approval card's outerHTML to identify its source.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  await page.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await input.fill("You must call the spawn_agents tool right now with 2 subagents: one researches Next.js caching, one writes a summary. Use spawn_agents, do not answer directly.");
  await input.press("Enter");
  const card = page.locator('[data-slot="approval-card"]');
  await card.waitFor({ timeout: 300_000 });
  const html = await card.first().evaluate((el) => el.outerHTML);
  console.log("CARD HTML:\n" + html.slice(0, 4000));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
