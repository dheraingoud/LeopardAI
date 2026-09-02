// @ts-nocheck — probe: assistant Regenerate menu → "Retry with" another model
// → re-streams and replaces the reply.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/regenerate";

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  const t0 = Date.now();
  const stamp = (l: string) => console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, l);
  page.on("pageerror", (e) => stamp(`[pageerror] ${String(e).slice(0, 200)}`));

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.waitFor({ timeout: 60_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(3000);

  await input.fill("Reply with exactly: apple red");
  await input.press("Enter");
  await page.waitForFunction(() => (window as any).__chatStatus === "ready", undefined, { timeout: 180_000 });
  stamp("first reply done");

  await page.locator('[data-slot="message-pair"]').last().waitFor({ timeout: 30_000 });
  const pair = page.locator('[data-slot="message-pair"]').last();
  await pair.scrollIntoViewIfNeeded().catch(() => {});
  await pair.hover();
  const regenBtn = pair.locator('button[aria-label="Regenerate response"]').first();
  await regenBtn.click();
  const menu = page.locator('[data-slot="regenerate-menu"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/menu.png` });

  // Pick "Retry with…" — a different model than current.
  const opts = menu.locator("button");
  const count = await opts.count();
  stamp(`menu options: ${count}`);
  let picked = "";
  for (let i = 0; i < count; i++) {
    const b = opts.nth(i);
    const txt = (await b.innerText().catch(() => "")) ?? "";
    stamp(`  opt[${i}]: ${txt.replace(/\n/g, " | ")}`);
    if (picked) continue;
    if (/^Retry$/.test(txt.trim())) continue; // plain retry = same model
    if (/current/i.test(txt)) continue;
    if (/deepseek|kimi|gemma/i.test(txt)) continue; // known-dead upstreams
    picked = txt.replace(/\n/g, " | ");
    await b.click();
  }
  stamp(`picked: ${picked || "(none — fell through)"}`);
  if (!picked) {
    await page.screenshot({ path: `${SHOTS}/no-option.png` });
    process.exit(1);
  }

  await page
    .waitForFunction(() => (window as any).__chatStatus !== "ready", undefined, { timeout: 30_000 })
    .then(() => stamp("REGENERATION STARTED"))
    .catch(() => { stamp("FAIL: regen never started"); process.exit(1); });
  const settled = await page
    .waitForFunction(() => (window as any).__chatStatus === "ready", undefined, { timeout: 180_000 })
    .then(() => true)
    .catch(() => false);
  if (!settled) {
    stamp("HANG");
    await page.screenshot({ path: `${SHOTS}/hang.png`, fullPage: true });
    process.exit(1);
  }
  await page.waitForTimeout(2500);
  const pairs = await page.locator('[data-slot="message-pair"]').allInnerTexts().catch(() => []);
  const tail = (pairs[pairs.length - 1] ?? "").slice(-300).replace(/\n/g, " | ");
  stamp(`pairs: ${pairs.length}; last tail: ${tail}`);
  await page.screenshot({ path: `${SHOTS}/after.png`, fullPage: true });
  stamp("PASS");
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
