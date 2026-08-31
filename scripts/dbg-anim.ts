import { chromium } from "playwright";

async function main() {
  const b = await chromium.launch();
  const p = await b.newPage();
  const cdp = await p.context().newCDPSession(p);
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.addStyleTag({
    content: "*, *::before, *::after { animation-play-state: paused !important; transition: none !important; }",
  });
  await p.waitForTimeout(400);
  await p.screenshot({ path: "shots/anim-paused.png", clip: { x: 380, y: 20, width: 520, height: 420 } });
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
