import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3001/chat/j57d6yx5rrnsn72k4s3b20nyzs8dck9g", { waitUntil: "networkidle" });
  await p.waitForTimeout(3000);
  const txt = await p.evaluate(() => document.body.innerText);
  const m = txt.match(/[^\n]*tokens?[^\n]*/i);
  console.log("usage line:", JSON.stringify(m?.[0] ?? null));
  await p.screenshot({ path: "verify-usage-readout.png" });
  await b.close();
})();
