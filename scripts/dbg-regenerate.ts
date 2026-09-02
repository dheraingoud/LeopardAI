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
  // Options live in the floating dropdown (div.absolute) — the root also
  // contains the icon-only trigger button; scope it out.
  const opts = menu.locator("div.absolute button");
  // Batch-read once — the menu can unmount when the pair remounts on settle,
  // and per-option innerText calls then burn 30s timeouts each.
  const texts = (await opts.allInnerTexts().catch(() => [] as string[])) ?? [];
  stamp(`menu options: ${texts.length}`);
  texts.forEach((t, i) => stamp(`  opt[${i}]: ${t.replace(/\n/g, " | ")}`));
  let pickIdx = -1;
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    if (/^Retry/i.test(t.trim())) continue; // plain retry = same model
    if (/current/i.test(t)) continue;
    if (/deepseek|kimi|gemma/i.test(t)) continue; // known-dead upstreams
    pickIdx = i;
    break;
  }
  let picked = pickIdx >= 0 ? texts[pickIdx].replace(/\n/g, " | ") : "";
  // Click with reopen-retry: pair remount can close the menu between reads.
  for (let k = 0; k < 4 && pickIdx >= 0; k++) {
    const b = opts.nth(pickIdx);
    const ok = await b.click({ timeout: 3000 }).then(() => true).catch(() => false);
    if (ok) break;
    stamp("click failed — re-hover + reopen menu");
    await pair.hover().catch(() => {});
    await regenBtn.click().catch(() => {});
    await page.waitForTimeout(600);
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
