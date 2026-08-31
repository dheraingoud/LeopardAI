import { chromium } from "playwright";

async function main() {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.waitForTimeout(1500);
  const clip = { x: 380, y: 20, width: 520, height: 420 };

  const targets = [
    ["h2", 'main [data-slot="empty-state-greeting"]'],
    ["composerwrap", "main .isolate .mt-8"],
    ["composerbar", 'main [data-slot="composer-bar"]'],
  ] as const;

  for (const [name, sel] of targets) {
    await p.evaluate((s) => {
      const el = document.querySelector(s);
      if (el) (el as HTMLElement).style.visibility = "hidden";
    }, sel);
    await p.waitForTimeout(200);
    await p.screenshot({ path: `shots/bs2-${name}.png`, clip });
    await p.evaluate((s) => {
      const el = document.querySelector(s);
      if (el) (el as HTMLElement).style.visibility = "";
    }, sel);
  }
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
