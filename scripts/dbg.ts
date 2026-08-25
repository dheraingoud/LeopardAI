import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const logs: string[] = [];
  p.on("console", (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  p.on("pageerror", (e) => logs.push("PAGEERROR: " + String(e).slice(0, 300)));
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForTimeout(4000);
  const dom = await p.evaluate(() => ({
    textareas: document.querySelectorAll("textarea").length,
    mainText: (document.querySelector("main")?.innerText ?? "").slice(0, 300),
    url: location.pathname,
  }));
  console.log(JSON.stringify({ dom, logs: logs.slice(-15) }, null, 2));
  await b.close();
})();
