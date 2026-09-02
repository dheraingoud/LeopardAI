// @ts-nocheck — pick model by label substring, send "Say OK.", report settle time
import { chromium } from "playwright";
const label = process.argv[2];
async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  await page.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  const trig = page.locator('[data-slot="model-selector-trigger"]');
  await trig.waitFor({ timeout: 60_000 });
  await trig.click();
  await page.locator('[data-slot="model-selector-item"]').filter({ hasText: label }).first().click();
  const t0 = Date.now();
  await page.locator('[data-slot="composer-bar"] textarea').fill("Say OK.");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => (window as any).__chatStatus !== "ready", undefined, { timeout: 15_000 }).catch(() => {});
  const ok = await page.waitForFunction(() => (window as any).__chatStatus === "ready", undefined, { timeout: 120_000 }).then(() => true).catch(() => false);
  console.log(`${label}: settled=${ok} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await browser.close();
}
main().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
