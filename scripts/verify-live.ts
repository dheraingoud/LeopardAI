import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  p.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForTimeout(3000);
  const ta = p.locator("textarea").first();
  await ta.click();
  await ta.fill("Write three short paragraphs about amber gemstones.");
  await p.keyboard.press("Enter");
  // mid-stream probes
  await p.waitForTimeout(4000);
  const mid = await p.evaluate(() => ({
    carets: document.querySelectorAll(".leopard-stream-caret").length,
    freshTails: document.querySelectorAll(".leopard-fresh-tail").length,
    thinking: document.querySelectorAll('[data-slot="thinking-indicator"], .thinking-indicator').length,
    timer: /\d+\.\ds/.test(document.body.innerText),
  }));
  await p.screenshot({ path: "../verify-live-mid.png" });
  await p.waitForTimeout(14000);
  const settled = await p.evaluate(() => ({
    carets: document.querySelectorAll(".leopard-stream-caret").length,
    timer: /\d+\.\ds/.test(document.body.innerText),
    actions: document.querySelectorAll("button").length,
  }));
  await p.screenshot({ path: "../verify-live-settled.png" });
  console.log(JSON.stringify({ mid, settled, errors: errors.slice(0, 4) }, null, 2));
  await b.close();
})();
