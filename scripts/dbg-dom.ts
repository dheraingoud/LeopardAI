// @ts-nocheck
import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  const row = p.locator('text=zebra apple melon kiwi').first();
  await row.waitFor({ timeout: 60_000 });
  await row.click();
  await p.waitForTimeout(5000);
  console.log(await p.evaluate(`JSON.stringify({
    status: window.__chatStatus,
    markdownBody: document.querySelectorAll('.markdown-body').length,
    msgActions: document.querySelectorAll('[data-slot="message-actions"]').length,
    mains: document.querySelectorAll('main').length,
    slots: [...new Set([...document.querySelectorAll('[data-slot]')].map(e => e.getAttribute('data-slot')))].slice(0, 60),
  }, null, 1)`));
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
