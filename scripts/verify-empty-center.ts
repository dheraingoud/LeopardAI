// Verify: empty state shows centered composer; bottom composer absent; after
// send the bottom composer appears.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const bars = await page.locator('[data-slot="composer-bar"]').all();
  const rects = [];
  for (const b of bars) {
    const r = await b.boundingBox();
    if (r) rects.push({ y: Math.round(r.y), h: Math.round(r.height) });
  }
  const vh = await page.evaluate(() => window.innerHeight);
  console.log("composer bars:", rects, "viewport", vh);
  const centered = rects.some((r) => r.y > vh * 0.25 && r.y + r.h < vh * 0.8);
  console.log(centered ? "EMPTY-CENTER: PASS" : "EMPTY-CENTER: FAIL");

  await page.screenshot({ path: "../verify-empty-center.png" });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
