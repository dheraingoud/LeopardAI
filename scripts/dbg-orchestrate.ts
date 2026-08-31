// Φ-multi-agent e2e: force a spawn_agents call, approve via the AskCard,
// screenshot the live card (running → settled → expanded), then reload and
// verify the settled card persists.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync("shots/orch", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1560, height: 1000 } });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200));
  });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });

  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill(
    "Use a team of subagents for this: research the latest Next.js caching changes, then write a short summary, then have another agent verify it. Use spawn_agents.",
  );
  await page.keyboard.press("Enter");

  // 1. AskCard appears (approval gate) → Allow.
  const card = page.locator('[data-slot="approval-card"]');
  await card.waitFor({ timeout: 120_000 });
  await page.screenshot({ path: "shots/orch/1-approval.png" });
  await card.locator('button:has-text("Allow")').click();

  // 2. Live orchestration card while agents run.
  const runCard = page.locator('[data-slot="agent-run-card"]');
  await runCard.waitFor({ timeout: 120_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "shots/orch/2-running.png" });

  // 3. Wait for the turn to settle (message actions render at end).
  await page.waitForSelector('[data-slot="message-actions"]', { timeout: 300_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "shots/orch/3-settled.png" });

  // 4. Expand the card.
  await runCard.locator("button").first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: "shots/orch/4-expanded.png", fullPage: true });

  // 5. Reload → card persists settled.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const after = await page.locator('[data-slot="agent-run-card"]').count();
  await page.screenshot({ path: "shots/orch/5-reload.png", fullPage: true });
  console.log("cards after reload:", after);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
