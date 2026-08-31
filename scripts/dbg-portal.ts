import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: "shots/portal-before.png", clip: { x: 380, y: 20, width: 520, height: 420 } });
  await p.evaluate(() => {
    const el = document.querySelector("nextjs-portal");
    if (el) (el as HTMLElement).style.display = "none";
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: "shots/portal-after.png", clip: { x: 380, y: 20, width: 520, height: 420 } });
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
