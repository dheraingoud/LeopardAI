/* Wave-3 verify: single amber caret, amber fresh tail, timer, actions, regen ghost. */
import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 160));
  });

  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const ta = page.locator("textarea").first();
  await ta.click();
  await ta.fill("Write a 3-sentence story about a leopard.");
  await page.keyboard.press("Enter");

  await page.waitForTimeout(3500);
  const mid = await page.evaluate(() => ({
    carets: document.querySelectorAll(".leopard-stream-caret").length,
    freshTail: !!document.querySelector(".leopard-fresh-tail"),
    freshColor:
      getComputedStyle(document.querySelector(".leopard-fresh-tail") ?? document.body).color,
    timer: !!document.querySelector(".tabular-nums"),
    timerText: document.querySelector(".tabular-nums")?.textContent ?? null,
  }));
  await page.screenshot({ path: "../verify-w3-mid.png" });

  // NIM models are slow (70-80s first response) — poll for the settled state
  // instead of a fixed sleep.
  await page
    .waitForSelector('[data-slot="message-actions"]', { timeout: 150_000 })
    .catch((e) => errors.push("settled wait: " + String(e).slice(0, 120)));
  const settled = await page.evaluate(() => ({
    carets: document.querySelectorAll(".leopard-stream-caret").length,
    actions: document.querySelectorAll('[data-slot="message-actions"]').length,
    timerText: document.querySelector(".tabular-nums")?.textContent ?? null,
  }));
  await page.screenshot({ path: "../verify-w3-settled.png" });

  // regen ghost: hover last assistant → click regenerate (aria-label)
  await page.locator("text=leopard").last().hover().catch(() => {});
  const regen = page.getByLabel("Regenerate response").last();
  await regen.scrollIntoViewIfNeeded().catch(() => {});
  await regen.click({ force: true }).catch((e) => errors.push("regen click: " + e));
  await page.waitForTimeout(1500);
  const ghost = await page.evaluate(() => ({
    assistantRows: document.querySelectorAll('[data-slot="message-actions"]').length,
    bodyHasText: document.body.innerText.includes("story") || document.body.innerText.length > 300,
  }));
  await page.screenshot({ path: "../verify-w3-regen.png" });

  console.log(JSON.stringify({ mid, settled, ghost, errors: errors.slice(0, 6) }, null, 2));
  await browser.close();
})();
