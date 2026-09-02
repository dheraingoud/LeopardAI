// @ts-nocheck — one-off DOM dump after a settled reply
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1560, height: 1000 } });
  await page.goto("http://localhost:3001/chat/j573er3j7w3vx7b4dh1zmj7qc18djqqh", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-slot="composer-bar"] textarea', { timeout: 60_000 });
  await page
    .waitForFunction(() => window.__chatStatus === "ready", undefined, { timeout: 120_000 })
    .catch(() => {});
  // wait for hydration of message bodies
  await page.waitForSelector("main p", { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const dump = await page.evaluate(`(() => {
    const q = (s) => document.querySelectorAll(s).length;
    const last = document.querySelectorAll('[data-slot="message-actions"]');
    const reveal = document.querySelectorAll('.action-reveal');
    const texts = [...document.querySelectorAll('main p')].slice(-3).map(p => p.textContent.slice(0, 60));
    return {
      messageActions: last.length,
      actionReveal: reveal.length,
      revealClass: reveal[reveal.length-1]?.className ?? null,
      revealBox: (() => { const el = reveal[reveal.length-1]; if (!el) return null; const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })(),
      lastParas: texts,
      status: window.__chatStatus,
    };
  })()`);
  console.log(JSON.stringify(dump, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
