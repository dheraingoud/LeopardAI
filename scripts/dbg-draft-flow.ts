// @ts-nocheck — probe: draft send → nav → pickup send → watch status until
// ready (or report stuck), logging every /api/chat request + console error.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300));
  });
  page.on("request", (r) => {
    if (r.url().includes("/api/chat")) console.log("[req]", r.method(), new Date().toISOString().slice(11, 19));
  });
  page.on("response", (r) => {
    if (r.url().includes("/api/chat")) console.log("[resp]", r.status(), new Date().toISOString().slice(11, 19));
  });
  page.on("requestfinished", (r) => {
    if (r.url().includes("/api/chat")) console.log("[req-done]", new Date().toISOString().slice(11, 19));
  });
  page.on("requestfailed", (r) => {
    if (r.url().includes("/api/chat")) console.log("[req-FAILED]", r.failure()?.errorText, new Date().toISOString().slice(11, 19));
  });

  await page.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  await page.locator('[data-slot="composer-bar"] textarea').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1000);

  const poll = setInterval(async () => {
    try {
      const s = await page.evaluate(() => (window as any).__chatStatus ?? "n/a");
      console.log(`[status] ${s} @${new Date().toISOString().slice(11, 19)}`);
    } catch {}
  }, 2000);

  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill('Reply with exactly: noted.');
  await page.keyboard.press("Enter");
  console.log("sent draft");

  // wait until status == ready sustained, or 90s
  let last = "";
  let readySince = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 90_000) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => (window as any).__chatStatus ?? "n/a").catch(() => "n/a");
    if (s !== last) { last = s; }
    if (s === "ready") {
      if (!readySince) readySince = Date.now();
      if (Date.now() - readySince > 5000) break;
    } else readySince = 0;
  }
  clearInterval(poll);
  console.log("final status:", last, "url:", page.url());
  await browser.close();
}
main();
