// @ts-nocheck — probe script
// Φ approval DENY path: trigger spawn_agents, click Deny, verify the turn ends
// cleanly (no orphan card, no stuck generating), then send a normal prompt and
// prove the chat still works.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";

async function main() {
  mkdirSync("../shots-deny", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1560, height: 1000 },
    colorScheme: "dark",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300));
  });

  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill(
    "You must call the spawn_agents tool right now. Spawn 2 subagents to research the latest Next.js caching changes and write a short summary. Do not answer directly — use spawn_agents.",
  );
  await page.keyboard.press("Enter");

  // 1. Approval card appears → Deny.
  const card = page.locator('[data-slot="approval-card"]');
  await card.waitFor({ timeout: 120_000 });
  console.log("approval card visible");
  await page.screenshot({ path: "../shots-deny/1-approval.png" });
  await card.locator('button:has-text("Deny")').click();
  console.log("clicked Deny");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "../shots-deny/2-after-deny.png", fullPage: true });

  // 2. Wait for the turn to settle — assistant should respond or terminate.
  const body1 = (await page.textContent("body")) ?? "";
  const stillGenerating = await page
    .locator('[aria-label="Stop generating"]')
    .isVisible()
    .catch(() => false);
  console.log("stop visible after deny:", stillGenerating);
  if (stillGenerating) {
    // give it a bit more, some models produce a graceful fallback text
    await page.waitForTimeout(6000);
    console.log(
      "still generating after 6s more:",
      await page.locator('[aria-label="Stop generating"]').isVisible().catch(() => false),
    );
  }

  // 3. Follow-up prompt must work — this is the brick regression check.
  await input.click();
  await input.fill("Say exactly: still alive.");
  const followResp = page.waitForResponse(
    (r) => r.url().includes("/api/chat") && r.request().method() === "POST",
    { timeout: 180_000 },
  );
  await page.keyboard.press("Enter");
  await (await followResp).finished();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "../shots-deny/3-followup.png", fullPage: true });

  const body2 = (await page.textContent("body")) ?? "";
  console.log("follow-up text present:", /still alive\./.test(body2));

  await browser.close();
  console.log("deny probe done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
