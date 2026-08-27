/* Watch the AskCard after it appears: does it persist or vanish? Samples DOM
 * every 1s for 30s; reports first-seen, last-seen, and whether the composer
 * or ApprovalDock carried it. */
import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE-ERR:", m.text().slice(0, 250)); });
  p.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 250)));
  await p.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3000);
  const ta = p.locator("textarea").first();
  await ta.click();
  await ta.fill("Call the webFetch tool with url https://example.com right now. Do not answer from memory.");
  await ta.press("Enter");
  let firstSeen = -1, lastSeen = -1, everDock = false, everInline = false;
  const t0 = Date.now();
  for (let i = 0; i < 90; i++) {
    await p.waitForTimeout(1000);
    const t = (Date.now() - t0) / 1000;
    const state = await p.evaluate(() => {
      const allowBtns = [...document.querySelectorAll("button")].filter((x) => /^\s*allow\s*$/i.test(x.textContent ?? ""));
      return {
        allowCount: allowBtns.length,
        // dock = the fixed composer-zone card (contains ShieldAlert svg + backdrop-blur)
        dock: !!document.querySelector(".backdrop-blur-xl button"),
        thinking: document.body.innerText.includes("Thought"),
      };
    });
    if (state.allowCount > 0) {
      if (firstSeen < 0) firstSeen = t;
      lastSeen = t;
      if (state.dock) everDock = true; else everInline = true;
    }
    if (i % 5 === 0 || state.allowCount > 0) console.log(`t=${t.toFixed(0)}s allow=${state.allowCount} dock=${state.dock}`);
    if (lastSeen > 0 && t - lastSeen > 12) break; // vanished for 12s → stop
  }
  console.log(JSON.stringify({ firstSeen, lastSeen, everDock, everInline }));
  await b.close();
})();
