import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1365, height: 768 } })).newPage();
  await page.addInitScript(() => { try { localStorage.setItem("theme","dark"); } catch {} });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const bar = page.locator('[data-slot="composer-bar"]');
  const box = await bar.boundingBox();
  console.log("composer width:", box?.width, "height:", box?.height);
  const greeting = await page.locator('[data-slot="empty-state-greeting"]').innerText().catch(() => "NONE");
  console.log("greeting:", JSON.stringify(greeting));
  const beamOk = await page.evaluate(() => {
    const el = document.querySelector('[data-slot="composer-bar"]');
    if (!el) return "no bar";
    const b = getComputedStyle(el, "::before");
    return b.animationName + " / " + b.backgroundImage.slice(0, 60);
  });
  console.log("beam ::before:", beamOk);
  const bubble = await page.locator('[data-slot="assistant-modal"]').count();
  console.log("assistant-modal present:", bubble);
  await page.screenshot({ path: "../sweep/verify-empty.png" });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
