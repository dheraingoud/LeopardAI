// @ts-nocheck — probe: reasoning panel ticks live while thinking and rests as
// "Thought for N seconds"; NO whole-run "total" stat near message actions.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/thinking-time";

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

  await input.fill(
    "Prove step by step that there are infinitely many primes of the form 4k+3. Take your time and think carefully.",
  );
  await input.press("Enter");
  stamp("sent");

  // Watch the reasoning panel trigger while it streams.
  const panel = page.locator('[data-slot="reasoning-panel"]').first();
  const havePanel = await panel.waitFor({ timeout: 90_000 }).then(() => true).catch(() => false);
  stamp(`reasoning panel appeared: ${havePanel}`);
  if (!havePanel) {
    await page.screenshot({ path: `${SHOTS}/no-panel.png`, fullPage: true });
    process.exit(1);
  }
  // Sample the trigger text ~every 700ms — should show a rising "Ns".
  const samples: string[] = [];
  for (let i = 0; i < 30; i++) {
    const txt = (await panel.locator("button").first().innerText().catch(() => "")) ?? "";
    if (txt && samples[samples.length - 1] !== txt) samples.push(txt.replace(/\n/g, " | "));
    if (/Thought for \d+ seconds/.test(txt)) break;
    await page.waitForTimeout(700);
  }
  stamp(`trigger samples: ${JSON.stringify(samples)}`);
  const ticked = samples.some((s) => /Thinking[\s|]*\d+s/.test(s));
  const rested = samples.some((s) => /Thought for \d+ seconds/.test(s));
  stamp(`live ticking seen: ${ticked}; resting label ok: ${rested}`);

  await page.waitForFunction(() => (window as any).__chatStatus === "ready", undefined, { timeout: 180_000 });
  await page.waitForTimeout(1500);
  await panel.screenshot({ path: `${SHOTS}/panel.png` }).catch(() => {});

  // No whole-run timing stat anywhere near the actions row.
  const total = await page.locator('[data-slot="message-timing"]').count();
  stamp(`message-timing elements: ${total}`);

  if (!ticked || !rested || total !== 0) {
    stamp("FAIL");
    await page.screenshot({ path: `${SHOTS}/fail.png`, fullPage: true });
    process.exit(1);
  }
  stamp("PASS");
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
