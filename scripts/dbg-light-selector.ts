// @ts-nocheck — probe script
import { chromium } from "playwright";

async function main() {
  const b = await chromium.launch();
  const p = await (
    await b.newContext({ viewport: { width: 1560, height: 1000 }, colorScheme: "light" })
  ).newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForTimeout(700);
  await p.locator('[data-slot="model-selector-trigger"]').click();
  await p.waitForTimeout(600);
  const el = p.locator('[data-slot="model-selector-content"]');
  console.log("text:", JSON.stringify(await el.innerText()));
  console.log("items:", await p.locator('[data-slot="model-selector-item"]').count());
  console.log("bg:", await el.evaluate((e) => getComputedStyle(e.querySelector("div")).backgroundColor));
  await el.screenshot({ path: "../shots-sweep-light/selector-zoom.png" });
  await b.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
