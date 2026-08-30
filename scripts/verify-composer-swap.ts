import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-slot="composer-bar"]');
  await page.fill('[data-slot="composer-bar"] textarea', "hi");
  await page.click('[data-slot="composer-send"]');
  await page.waitForTimeout(4000);
  const rects = [];
  for (const b of await page.locator('[data-slot="composer-bar"]').all()) {
    const r = await b.boundingBox();
    if (r) rects.push({ y: Math.round(r.y), h: Math.round(r.height) });
  }
  const vh = await page.evaluate(() => window.innerHeight);
  const emptyGone = !(await page.locator('[data-slot="empty-state"]').count());
  const bottom = rects.some((r) => r.y > vh * 0.8);
  console.log("bars:", rects, "emptyGone:", emptyGone, "bottomBar:", bottom);
  console.log(rects.length === 1 && emptyGone && bottom ? "SWAP: PASS" : "SWAP: FAIL");
  await page.screenshot({ path: "../verify-composer-swap.png" });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
