import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.click("[data-slot='model-selector-trigger']");
  await page.waitForTimeout(600);
  const totalItems = await page.locator("[data-slot='model-selector-item']").count();
  await page.click("[data-slot='model-selector-search']");
  await page.keyboard.type("kimi", { delay: 40 });
  await page.waitForTimeout(500);
  const queryValue = await page.locator("[data-slot='model-selector-search']").inputValue();
  const filtered = await page.locator("[data-slot='model-selector-item']").count();
  await page.screenshot({ path: "shots/model-search.png" });
  console.log(JSON.stringify({ totalItems, queryValue, filtered }));
  await browser.close();
}
void main();
