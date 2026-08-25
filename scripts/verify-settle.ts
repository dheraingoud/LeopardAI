import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  const ta = p.locator("textarea").first();
  await ta.click();
  await ta.fill("In two sentences, what is amber?");
  await p.keyboard.press("Enter");
  // mid-stream probe at 2s
  await p.waitForTimeout(2000);
  const mid = await p.evaluate(() => ({
    carets: document.querySelectorAll(".leopard-stream-caret").length,
    amber: getComputedStyle(document.querySelector(".leopard-stream-caret") ?? document.body).backgroundColor,
    freshTail: document.querySelectorAll(".leopard-fresh-tail").length,
  }));
  await p.screenshot({ path: "../verify-s-mid.png" });
  // poll until caret gone (settled) max 60s
  let settledOk = false;
  for (let i = 0; i < 30; i++) {
    await p.waitForTimeout(2000);
    const c = await p.evaluate(() => document.querySelectorAll(".leopard-stream-caret").length);
    if (c === 0) { settledOk = true; break; }
  }
  const settled = await p.evaluate(() => ({
    carets: document.querySelectorAll(".leopard-stream-caret").length,
    timerChip: /\d+\.\ds/.test(document.body.innerText),
    actionsBar: document.querySelectorAll('[data-slot="message-actions"], .action-reveal').length,
    sidebarNewChat: [...document.querySelectorAll("aside *, nav *")].some(el => el.textContent === "New Chat"),
  }));
  await p.screenshot({ path: "../verify-s-settled.png" });
  console.log(JSON.stringify({ mid, settled, settledOk }, null, 2));
  await b.close();
})();
