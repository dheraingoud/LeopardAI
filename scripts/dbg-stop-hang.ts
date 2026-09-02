// @ts-nocheck — diagnose follow-up hang after stop-during-orchestration.
// Same flow as dbg-stop-orch, but on follow-up timeout dumps status, composer
// state, console errors, and pending network requests.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/stop-hang";

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  const t0 = Date.now();
  const stamp = (l: string) => console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, l);
  page.on("pageerror", (e) => stamp(`[pageerror] ${String(e).slice(0, 400)}`));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") stamp(`[console.${m.type()}] ${m.text().slice(0, 300)}`);
  });
  page.on("requestfailed", (r) => stamp(`[reqfail] ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);

  await input.fill(
    "Use spawn_agents: spawn 3 subagents — one researches Next.js caching, one writes a summary, one fact-checks. You must call spawn_agents.",
  );
  await input.press("Enter");
  stamp("sent");

  const card = page.locator('[data-slot="approval-card"]');
  await card.waitFor({ timeout: 300_000 });
  stamp("approval → Allow");
  await card.locator('button:has-text("Allow")').click();
  const runCard = page.locator('[data-slot="agent-run-card"]');
  await runCard.waitFor({ timeout: 120_000 });
  await page.waitForTimeout(20_000);

  await page.locator('[aria-label="Stop generating"]').click();
  await page.waitForFunction(() => (window as any).__chatStatus === "ready", undefined, { timeout: 60_000 });
  stamp("stopped + ready");

  await input.fill("Reply with exactly: recovered.");
  await input.press("Enter");
  stamp("follow-up sent");
  try {
    await page.waitForFunction(() => (window as any).__chatStatus === "ready", undefined, { timeout: 120_000 });
    stamp("follow-up settled ready — NO HANG");
  } catch {
    stamp("FOLLOW-UP HUNG — dumping state");
    const status = await page.evaluate(() => (window as any).__chatStatus);
    stamp(`status: ${status}`);
    const stopVisible = await page.locator('[aria-label="Stop generating"]').isVisible().catch(() => false);
    const sendVisible = await page.locator('[aria-label="Send message"], [data-slot="composer-bar"] button[type="submit"]').isVisible().catch(() => false);
    stamp(`stop btn: ${stopVisible}, send btn: ${sendVisible}`);
    const composerDisabled = await input.isDisabled().catch(() => "n/a");
    stamp(`composer disabled: ${composerDisabled}`);
    const cardVisible = await page.locator('[data-slot="approval-card"]').isVisible().catch(() => false);
    stamp(`approval card visible again: ${cardVisible}`);
    const body = ((await page.textContent("body")) ?? "").replace(/\s+/g, " ");
    stamp(`body tail: ${body.slice(-400)}`);
    await page.screenshot({ path: `${SHOTS}/hang.png`, fullPage: true });
    // Live traffic check: is a POST to /api/chat still open?
    const pending = await page.evaluate(() => performance.getEntriesByType("resource").slice(-5).map((r: any) => `${r.name} dur=${Math.round(r.duration)}`));
    stamp(`recent resources: ${JSON.stringify(pending)}`);
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
