import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(5000);
  // open the existing math chat from sidebar (persisted turn w/ reasoning)
  const link = p.getByText("Quadratic Formula LaTeX Mermaid Flowchart").first();
  if (await link.count()) { await link.click(); await p.waitForTimeout(5000); }
  const panels = await p.locator('[data-slot="reasoning-panel"]').all();
  const texts: string[] = [];
  for (const el of panels) texts.push(((await el.innerText()) ?? "").slice(0, 120).replace(/\n/g, " | "));
  console.log(JSON.stringify({ count: panels.length, texts }, null, 2));
  await p.screenshot({ path: "../verify-t2-history.png", fullPage: false });
  await b.close();
})();
