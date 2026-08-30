import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1365, height: 768 } })).newPage();
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.click('[data-slot="model-selector-trigger"]');
  await page.waitForTimeout(500);
  await page.click('[data-slot="model-selector-search"]');
  await page.keyboard.type("deep", { delay: 60 });
  await page.waitForTimeout(400);
  const val = await page.inputValue('[data-slot="model-selector-search"]').catch(() => "ERR");
  const items = await page.locator('[data-slot="model-selector-item"]').count();
  const open = await page.locator('[data-slot="model-selector-content"]').count();
  console.log("typed value:", JSON.stringify(val), "| items:", items, "| popover open:", open > 0);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
