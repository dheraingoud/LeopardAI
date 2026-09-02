// @ts-nocheck — probe script
// Φ surface 17: auto-scroll behavior.
//   run-start re-pins to bottom, user scroll-up disengages mid-stream,
//   position preserved at settle, next send re-pins.
// Screenshots → C:/Users/HP/leopard-shots/auto-scroll/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/auto-scroll";
const results = {};

const SCROLLER = "div.flex-1.min-h-0.overflow-y-auto";

async function scrollState(page) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return {
      top: Math.round(el.scrollTop),
      bottom: Math.round(el.scrollHeight - el.clientHeight),
      atBottom: el.scrollHeight - el.scrollTop - el.clientHeight < 80,
    };
  }, SCROLLER);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  // Short viewport → even a modest reply overflows → scrollable.
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 520 } })).newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);

  // Long reply so the stream overflows the viewport.
  await input.fill("Write a detailed 400-word essay about the history of the zebra. No lists, plain paragraphs.");
  await input.press("Enter");
  await page.waitForFunction(() => window.__chatStatus === "submitted" || window.__chatStatus === "streaming", undefined, { timeout: 30_000 });

  // 1. run-start re-pin
  await page.waitForTimeout(1500);
  let s = await scrollState(page);
  results.pinOnRunStart = !!s && s.atBottom;
  console.log("pin on run start:", results.pinOnRunStart, JSON.stringify(s));
  await page.screenshot({ path: `${SHOTS}/01-streaming-pinned.png` });

  // 2. user scroll-up disengages — position must NOT snap back while streaming.
  // Wait until content actually overflows (else "unpinned" is unmeasurable),
  // then wheel-up like a user (exercises the intent path).
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return el && el.scrollHeight - el.clientHeight > 100;
  }, SCROLLER, { timeout: 120_000 });
  await page.hover(SCROLLER);
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, -600); await page.waitForTimeout(80); }
  await page.waitForTimeout(2500);
  const mid = await scrollState(page);
  results.staysUnpinned = !!mid && !mid.atBottom;
  console.log("stays unpinned mid-stream:", results.staysUnpinned, JSON.stringify(mid));
  await page.screenshot({ path: `${SHOTS}/02-scrolled-up.png` });

  // 3. settle preserves position
  await page.waitForFunction(() => window.__chatStatus === "ready", undefined, { timeout: 300_000 });
  await page.waitForTimeout(1200);
  s = await scrollState(page);
  results.positionPreservedAtSettle = !!s && !s.atBottom;
  console.log("position preserved at settle:", results.positionPreservedAtSettle, JSON.stringify(s));
  await page.screenshot({ path: `${SHOTS}/03-settled-unpinned.png` });

  // 4. next send re-pins
  await input.fill("Thanks. One sentence summary please.");
  await input.press("Enter");
  await page.waitForFunction(() => window.__chatStatus === "submitted" || window.__chatStatus === "streaming", undefined, { timeout: 30_000 });
  await page.waitForTimeout(1000);
  s = await scrollState(page);
  results.repinOnNextSend = !!s && s.atBottom;
  console.log("re-pin on next send:", results.repinOnNextSend, JSON.stringify(s));
  await page.screenshot({ path: `${SHOTS}/04-repinned.png` });

  await page.waitForFunction(() => window.__chatStatus === "ready", undefined, { timeout: 300_000 });

  await browser.close();
  console.log("RESULTS " + JSON.stringify(results));
  const fail = Object.entries(results).filter(([, v]) => v === false).map(([k]) => k);
  if (fail.length) { console.log("FAILED: " + fail.join(", ")); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
