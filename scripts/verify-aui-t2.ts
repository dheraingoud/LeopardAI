/* Task 2 browser check: reasoning panel swap. Drives the real UI on :3001,
 * screenshots greeting → mid-stream → settled. Vision-verified by reader. */
import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.getByText("New Chat").first().click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "../verify-t2-1-greeting.png" });

  const ta = page.locator("textarea").first();
  await ta.click();
  await ta.fill("What is 17*23? Reason briefly step by step, then answer.");
  await page.keyboard.press("Enter");

  await page.waitForTimeout(4000);
  await page.screenshot({ path: "../verify-t2-2-streaming.png" });

  await page.waitForTimeout(15000);
  await page.screenshot({ path: "../verify-t2-3-settled.png" });

  const hasReasoningPanel = await page.locator('[data-slot="reasoning-panel"]').count();
  const hasOldCard = await page.locator(".cb-reasoning").count();
  console.log(JSON.stringify({ hasReasoningPanel, hasOldCard, errors: errors.slice(0, 5) }, null, 2));

  await browser.close();
})();
