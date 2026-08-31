import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill("textarea", "Say OK. Answer directly without using any tools.");
  await page.keyboard.press("Enter");
  await page.waitForSelector("button[aria-label='Stop generating']", { timeout: 30_000 }).catch(() => null);
  const t0 = Date.now();
  let settled = false;
  while (Date.now() - t0 < 120_000) {
    const s = await page.evaluate(() => ({
      status: (window as any).__chatStatus,
      ok: /\bOK\b/i.test(document.body.innerText),
    }));
    if (s.status === "ready") { settled = true; console.log(JSON.stringify({ settled, ok: s.ok, ms: Date.now() - t0 })); break; }
    await page.waitForTimeout(2000);
  }
  if (!settled) console.log(JSON.stringify({ settled: false }));
  await browser.close();
}
void main();
