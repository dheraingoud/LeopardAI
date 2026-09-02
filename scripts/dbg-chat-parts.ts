// @ts-nocheck — dump rendered structure of a chat
import { chromium } from "playwright";
const CHAT = process.argv[2];
async function main() {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  await p.goto(`http://localhost:3001/chat/${CHAT}`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector('[data-slot="composer-bar"] textarea', { timeout: 90_000 });
  await p.waitForTimeout(5000);
  console.log(await p.evaluate(`JSON.stringify({
    status: window.__chatStatus,
    bodyText: document.querySelector('div.flex-1.min-h-0.overflow-y-auto')?.innerText?.slice(0, 900),
    cards: document.querySelectorAll('[data-slot="agent-run-card"]').length,
    toolCards: [...document.querySelectorAll('[class]')].filter(e => /tool/i.test(e.getAttribute('data-slot')||'')).length,
  }, null, 1)`));
  await p.screenshot({ path: "C:/Users/HP/leopard-shots/orch-flash/parts-dump.png" });
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
