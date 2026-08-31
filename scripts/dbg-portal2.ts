import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.waitForTimeout(1500);
  const hosts = await p.evaluate(() =>
    Array.from(document.querySelectorAll("*")).filter((e) => e.tagName.startsWith("NEXTJS") || e.tagName.startsWith("NEXT-")).map((e) => e.tagName),
  );
  console.log("hosts:", hosts);
  // hide each one at a time
  for (let i = 0; i < hosts.length; i++) {
    await p.evaluate((idx) => {
      const els = Array.from(document.querySelectorAll("*")).filter((e) => e.tagName.startsWith("NEXT"));
      (els[idx] as HTMLElement).style.display = "none";
    }, i);
    await p.waitForTimeout(200);
    await p.screenshot({ path: `shots/portal-hide-${i}.png`, clip: { x: 380, y: 20, width: 520, height: 420 } });
    await p.evaluate((idx) => {
      const els = Array.from(document.querySelectorAll("*")).filter((e) => e.tagName.startsWith("NEXT"));
      (els[idx] as HTMLElement).style.display = "";
    }, i);
  }
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
