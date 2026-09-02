// @ts-nocheck — probe: WHY do subagents fail? Run orchestration to settle,
// expand the card, dump every agent's status + note (the error message).
// Shots → C:/Users/HP/leopard-shots/agent-errors/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/agent-errors";

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

  // "proposed" phase has no "running" text — wait for run start FIRST,
  // then for settle ("done ·" summary), else we read the proposed snapshot.
  await page.waitForFunction(
    () => /running/i.test(document.querySelector('[data-slot="agent-run-card"]')?.textContent ?? ""),
    undefined,
    { timeout: 180_000, polling: 1000 },
  );
  stamp("agents running");
  await page.waitForFunction(
    () => /done ·|failed/i.test(document.querySelector('[data-slot="agent-run-card"]')?.textContent ?? "") &&
      !/running/i.test(document.querySelector('[data-slot="agent-run-card"]')?.textContent ?? ""),
    undefined,
    { timeout: 480_000, polling: 2000 },
  );
  stamp("card settled");
  // Master synthesis streams AFTER the tool returns — wait for stream end.
  await page
    .waitForFunction(() => (window as any).__chatStatus === "ready", undefined, { timeout: 240_000 })
    .then(() => stamp("stream ready (synthesis done)"))
    .catch(() => stamp("WARN: status never ready — synthesis may have hung"));

  // Expand via the header toggle button (aria-expanded), then dump the LAST
  // card (dedup can leave a stale first) — wait for per-agent rows.
  const runEl = runCard.last();
  const toggle = runEl.locator("button[aria-expanded]");
  if ((await toggle.getAttribute("aria-expanded").catch(() => null)) !== "true") {
    await toggle.click().catch(() => {});
    await page.waitForTimeout(1000);
  }
  if ((await toggle.getAttribute("aria-expanded").catch(() => null)) !== "true") {
    await toggle.click().catch(() => {});
    await page.waitForTimeout(800);
  }
  const expanded = await runEl.locator("button[aria-expanded]").getAttribute("aria-expanded").catch(() => "?");
  stamp(`aria-expanded: ${expanded}`);
  const full = await runEl.innerText().catch(() => "");
  console.log("=== CARD FULL TEXT ===\n" + full + "\n=== END ===");
  // Master's final answer — failsafe check: must NOT be a bare failure report.
  const bubbles = await page.locator('[data-slot="message-pair"]').allInnerTexts().catch(() => []);
  console.log("=== LAST PAIR (tail 1200) ===\n" + (bubbles[bubbles.length - 1] ?? "").slice(-1200));
  await page.screenshot({ path: `${SHOTS}/expanded.png`, fullPage: true });

  // Also dump the persisted tool output if accessible via message parts in DOM
  const toolText = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[data-slot*="tool"], [data-slot="message-pair"]'));
    return els.map((e) => e.textContent ?? "").join("\n---\n").slice(0, 6000);
  });
  console.log("=== PAIR TEXT ===\n" + toolText.slice(0, 6000));

  await browser.close();
  stamp("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
