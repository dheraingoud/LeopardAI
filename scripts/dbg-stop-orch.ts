// @ts-nocheck — probe: stop DURING a subagent orchestration run.
// Approval → Allow → card running → click Stop mid-run → must settle ready,
// card must not pulse "running" forever, follow-up prompt must still work.
// Shots → C:/Users/HP/leopard-shots/stop-orch/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/stop-orch";

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  const t0 = Date.now();
  const stamp = (l: string) => console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, l);
  page.on("pageerror", (e) => stamp(`[pageerror] ${String(e).slice(0, 300)}`));

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);

  await input.fill(
    "Use spawn_agents: spawn 3 subagents — one researches Next.js caching, one writes a summary, one fact-checks. You must call spawn_agents.",
  );
  await input.press("Enter");
  stamp("sent");

  // Approval gate
  const card = page.locator('[data-slot="approval-card"]');
  await card.waitFor({ timeout: 300_000 });
  stamp("approval card → Allow");
  await card.locator('button:has-text("Allow")').click();

  // Run card appears
  const runCard = page.locator('[data-slot="agent-run-card"]');
  await runCard.waitFor({ timeout: 120_000 });
  stamp("agent-run-card visible — letting agents work 20s");
  await page.waitForTimeout(20_000);
  await page.screenshot({ path: `${SHOTS}/1-running.png` });

  // Stop mid-orchestration
  const stop = page.locator('[aria-label="Stop generating"]');
  const stopVisible = await stop.isVisible().catch(() => false);
  stamp(`stop visible: ${stopVisible}`);
  if (!stopVisible) { console.log("FAIL: no stop control during orchestration"); process.exit(1); }
  await stop.click();
  stamp("clicked stop");

  // Must settle ready (abort propagates to subagents via genCtrl.signal)
  await page.waitForFunction(() => (window as any).__chatStatus === "ready", undefined, { timeout: 120_000 });
  stamp("settled ready after stop");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/2-after-stop.png`, fullPage: true });

  // Card must not still pulse "running" (settle-stale logic in message.tsx)
  const cardText = (await runCard.first().innerText().catch(() => "")) ?? "";
  const stillRunning = /running/i.test(cardText);
  stamp(`card text after stop: ${cardText.slice(0, 120).replace(/\n/g, " | ")}`);
  if (stillRunning) { console.log("FAIL: card still shows running after stop"); process.exit(1); }

  // Follow-up must work (composer not frozen)
  await input.fill("Reply with exactly: recovered.");
  await input.press("Enter");
  await page.waitForFunction(() => (window as any).__chatStatus === "ready", undefined, { timeout: 180_000 });
  const body = (await page.textContent("body")) ?? "";
  const recovered = /recovered\./.test(body);
  stamp(`follow-up recovered: ${recovered}`);
  if (!recovered) { console.log("FAIL: follow-up missing"); process.exit(1); }

  await browser.close();
  stamp("stop-orch probe PASS");
}
main().catch((e) => { console.error(e); process.exit(1); });
