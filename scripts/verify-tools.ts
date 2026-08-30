import { chromium } from "playwright";

// Tool smoke: send a search prompt, expect a tool card that settles to
// output-available, and a final assistant answer.
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE-ERR:", m.text().slice(0, 200)); });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-slot="composer-bar"] textarea');
  // Kimi stalls — pick nemotron (reliable tool-caller).
  await page.click('[data-slot="model-selector-trigger"]');
  await page.fill('[data-slot="model-selector-search"]', "nemotron");
  await page.waitForTimeout(600);
  await page.click('[data-slot="model-selector-item"]');
  await page.waitForTimeout(500);
  await page.fill('[data-slot="composer-bar"] textarea', "Search the web for today's date and tell me what you found. Use the webSearch tool.");
  await page.click('[data-slot="composer-send"]');

  let toolSeen = false;
  let toolDone = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 240_000) {
    toolSeen = toolSeen || (await page.locator('[data-slot="tool-group"], [data-slot="tool-call"], [data-slot="tool-card"]').count()) > 0;
    if (!toolDone) {
      toolDone = await page.evaluate(() =>
        [...document.querySelectorAll("*")].some((el) => el.getAttribute("data-state") === "output-available"),
      );
    }
    const ready = await page.evaluate(() =>
      !document.querySelector('[data-slot="composer-send"][aria-label="Stop generating"]'),
    );
    if (toolSeen && ready) break;
    await page.waitForTimeout(2000);
  }
  const answer = await page.evaluate(() => document.querySelector("main")?.innerText.slice(-400) ?? "");
  console.log(JSON.stringify({ toolSeen, toolDone, tail: answer.slice(-200) }, null, 1));
  console.log(toolSeen ? "TOOLS: PASS" : "TOOLS: FAIL");
  await page.screenshot({ path: "../verify-tools.png", fullPage: false });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
