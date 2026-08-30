import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1365, height: 768 } })).newPage();
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill('[data-slot="composer-bar"] textarea', "Say the word DONE and nothing else.");
  await page.click('[data-slot="composer-send"]');
  const t0 = Date.now();
  let text = "";
  while (Date.now() - t0 < 300_000) {
    await page.waitForTimeout(5000);
    text = await page.locator('[data-slot="message-pair"]').last().innerText().catch(() => "");
    const busy = await page.locator('[data-slot="composer-send"][aria-label="Stop generating"]').count();
    if (!busy && /DONE/.test(text)) break;
  }
  console.log("elapsed:", Math.round((Date.now() - t0) / 1000) + "s");
  console.log("contains DONE:", /DONE/.test(text));
  console.log("tail:", JSON.stringify(text.slice(-160)));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
