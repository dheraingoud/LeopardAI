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
    if (r) rects.push({ y: Math.round(r.y), height: Math.round(r.height) });
  }
  const vh = await page.evaluate(() => window.innerHeight);
  const emptyGone = !(await page.locator('[data-slot="empty-state"]').count());
  // Docked = bar's bottom edge in the lower stretch of the viewport (the bar
  // itself is ~100px tall, so checking its top edge misses a correctly docked bar).
  const bottom = rects.some((r) => r.y + r.height > vh * 0.85);
  // Identify whatever occupies the top-left white block seen in screenshots.
  const topLeft = await page.evaluate(() => {
    const el = document.elementFromPoint(100, 250) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      slot: el.getAttribute("data-slot"),
      cls: (el.className || "").toString().slice(0, 120),
      text: (el.innerText || "").slice(0, 80),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      bg: cs.backgroundColor,
    };
  });
  console.log("bars:", rects, "vh:", vh, "emptyGone:", emptyGone, "bottomBar:", bottom);
  console.log("topLeft@100,250:", JSON.stringify(topLeft));
  console.log(rects.length === 1 && emptyGone && bottom ? "SWAP: PASS" : "SWAP: FAIL");
  await page.screenshot({ path: "../verify-composer-swap.png" });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
