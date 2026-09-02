// @ts-nocheck — open newest "zebra" chat, dump message-actions state
import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  const row = p.locator('text=zebra apple melon kiwi').first();
  await row.waitFor({ timeout: 60_000 });
  await row.click();
  await p.waitForTimeout(4000);
  console.log("url:", p.url());
  await p.screenshot({ path: "C:/Users/HP/leopard-shots/zebra-chat.png" });
  const dump = await p.evaluate(`JSON.stringify({
    status: window.__chatStatus,
    actions: document.querySelectorAll('[data-slot="message-actions"]').length,
    reveals: document.querySelectorAll('.action-reveal').length,
    copyBtns: document.querySelectorAll('button[aria-label="Copy response"]').length,
    paras: [...document.querySelectorAll('main p')].slice(-4).map(x => x.textContent.slice(0, 50)),
  })`);
  console.log("dump:", dump);
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
