import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  const ta = p.locator("textarea").first();
  await ta.click();
  await ta.fill("Say exactly: alpha one");
  await p.keyboard.press("Enter");
  // wait settle: message-actions appear
  await p.waitForSelector('[data-slot="message-actions"]', { timeout: 300000 });
  const before = await p.evaluate(() => document.body.innerText.includes("alpha one"));
  // click regenerate (last icon-button in the actions bar)
  const regen = p.locator('[data-slot="message-actions"] button').last();
  await regen.click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: "../verify-r-mid.png" });
  // wait for regen to settle again
  await p.waitForSelector('[data-slot="message-actions"]', { timeout: 300000 });
  await p.waitForTimeout(1000);
  const counts = await p.evaluate(() => ({
    markdownBodies: document.querySelectorAll(".markdown-body").length,
    assistantRows: document.querySelectorAll('[data-slot="message-actions"]').length,
  }));
  await p.screenshot({ path: "../verify-r-after.png" });
  console.log(JSON.stringify({ before, counts, errors: errors.slice(0, 3) }, null, 2));
  await b.close();
})();
