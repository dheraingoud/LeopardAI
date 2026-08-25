/* After a webFetch-approval turn, dump the last assistant message DOM to see
 * exactly what rendered (card? nothing?) and when. */
import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  const ta = p.locator("textarea").first();
  await ta.click();
  await ta.fill("Call the webFetch tool with url https://example.com right now. Do not answer from memory, I need the live fetch result.");
  await p.keyboard.press("Enter");
  // poll for tool-ish elements for 60s
  for (let i = 0; i < 30; i++) {
    await p.waitForTimeout(2000);
    const snap = await p.evaluate(() => {
      const tools = [...document.querySelectorAll("[class*='cb-tool'], [class*='cb-ask']")].map((el) => ({
        cls: (el as HTMLElement).className.slice(0, 60),
        text: (el.textContent ?? "").slice(0, 120),
      }));
      const btns = [...document.querySelectorAll("button")].map((x) => x.textContent?.trim()).filter((t) => t && /allow|deny/i.test(t));
      return { tools, btns };
    });
    if (snap.tools.length || snap.btns.length) {
      console.log(`t=${(i + 1) * 2}s`, JSON.stringify(snap, null, 1));
    }
    if (snap.btns.length) break;
  }
  // full last-assistant dump
  const dump = await p.evaluate(() => {
    const msgs = [...document.querySelectorAll("[data-role='assistant'], .assistant-message, [class*='message']")];
    const last = msgs[msgs.length - 1] as HTMLElement | undefined;
    return {
      msgCount: msgs.length,
      lastText: (last?.innerText ?? "").slice(0, 800),
      lastHTML: (last?.innerHTML ?? "").slice(0, 1200),
    };
  });
  console.log(JSON.stringify(dump, null, 1));
  await p.screenshot({ path: "../probe-approval-dom.png", fullPage: false });
  await b.close();
})();
