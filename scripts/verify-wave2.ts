/* Wave-2 verify: flat user pairs, live caret, mermaid natural size, composer tint. */
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
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "../verify-w2-composer.png" }); // composer tint dark

  const ta = page.locator("textarea").first();
  await ta.click();
  await ta.fill(
    "Draw a mermaid flowchart: A → B → C → D with labels. Then one sentence."
  );
  await page.keyboard.press("Enter");
  await page.waitForTimeout(5000);
  await page.screenshot({ path: "../verify-w2-mid.png" }); // caret + streaming

  // wait for mermaid svg
  try {
    await page.waitForSelector(".cb-mermaid svg", { timeout: 60000 });
  } catch {
    /* report */
  }
  await page.waitForTimeout(8000);
  await page.screenshot({ path: "../verify-w2-settled.png" });

  const mmd = await page.evaluate(() => {
    const svg = document.querySelector(".cb-mermaid svg");
    const errBomb = document.querySelector('[id^="dmmd-"], .error-icon');
    const userBubble = document.querySelector(".cb-user-bubble");
    return {
      mermaidSvg: !!svg,
      mermaidW: svg?.getAttribute("style")?.slice(0, 80) ?? svg?.getAttribute("width"),
      strayErrorNodes: !!errBomb,
      oldUserBubbleGone: !userBubble,
      caret: !!document.querySelector(".leopard-stream-caret"),
    };
  });
  console.log(JSON.stringify({ ...mmd, errors: errors.slice(0, 6) }, null, 2));
  await browser.close();
})();
