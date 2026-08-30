import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1365, height: 768 } })).newPage();
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.click('[data-slot="model-selector-trigger"]');
  await page.waitForTimeout(600);
  const all = await page.locator('[data-slot="model-selector-item"]').count();
  console.log("items before search:", all);
  await page.fill('[data-slot="model-selector-search"]', "kimi");
  await page.waitForTimeout(500);
  const after = await page.locator('[data-slot="model-selector-item"]').count();
  const val = await page.inputValue('[data-slot="model-selector-search"]').catch(() => "ERR");
  console.log("input value after fill:", JSON.stringify(val));
  console.log("items after search:", after);
  const names = await page.locator('[data-slot="model-selector-item"]').allInnerTexts().catch(() => []);
  console.log("visible:", JSON.stringify(names.map(n => n.split("\n")[0])));
  await page.screenshot({ path: "../sweep/verify-picker.png" });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
