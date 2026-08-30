import { chromium } from "playwright";

// Send the webFetch prompt on nemotron; capture console errors + final status.
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.text().includes("[chat]")) console.log("BROWSER:", m.text().slice(0, 400));
  });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 400)));
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-slot="composer-bar"] textarea');
  await page.click('[data-slot="model-selector-trigger"]');
  await page.fill('[data-slot="model-selector-search"]', "nemotron");
  await page.waitForTimeout(600);
  await page.click('[data-slot="model-selector-item"]');
  await page.fill('[data-slot="composer-bar"] textarea', "Use the webFetch tool to fetch https://example.com and tell me the page title.");
  await page.click('[data-slot="composer-send"]');
  const t0 = Date.now();
  let dockSeen = false;
  while (Date.now() - t0 < 300_000) {
    dockSeen = (await page.locator('[data-slot="approval-card"], [data-slot="approval-dock"]').count()) > 0;
    const errored = await page.evaluate(() => document.body.innerText.includes("Response failed"));
    if (dockSeen || errored) { console.log("END:", dockSeen ? "DOCK" : "ERROR-STATE"); break; }
    await page.waitForTimeout(2000);
  }
  if (dockSeen) {
    await page.screenshot({ path: "../dbg-approval-card.png" });
    const allow = page.getByRole("button", { name: /allow/i }).first();
    await allow.click();
    console.log("clicked Allow");
    const t1 = Date.now();
    while (Date.now() - t1 < 180_000) {
      const done = await page.evaluate(() =>
        document.body.innerText.includes("Example Domain") || document.body.innerText.includes("Response failed"));
      if (done) break;
      await page.waitForTimeout(2000);
    }
    const tail = await page.evaluate(() => document.querySelector("main")?.innerText.slice(-300) ?? "");
    console.log("AFTER-ALLOW:", tail.includes("Example Domain") ? "TOOL EXECUTED" : tail.slice(-150));
  }
  await page.screenshot({ path: "../dbg-stream.png" });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
