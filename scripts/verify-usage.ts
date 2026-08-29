import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  const ta = p.locator("textarea").first();
  await ta.fill("reply with just: ok");
  await ta.press("Enter");
  // wait for stream to finish: send button reappears (not stop) & settle
  await p.waitForSelector('button[title="Send"]:not([disabled])', { timeout: 90000 }).catch(() => console.log("send btn never re-enabled"));
  await p.waitForTimeout(4000);
  const url = p.url();
  const id = url.split("/chat/")[1] ?? "";
  console.log("chatId:", id);
  if (id) {
    const r = await p.evaluate(async (cid) => {
      const res = await fetch(`/api/usage?chatId=${cid}`);
      return res.json();
    }, id);
    console.log("usage:", JSON.stringify(r));
  }
  const readout = await p.locator("text=/tokens|·/").first().isVisible().catch(() => false);
  await p.screenshot({ path: "verify-usage.png" });
  console.log("readout visible-ish:", readout);
  await b.close();
})();
