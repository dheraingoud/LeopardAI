// Verify (a) @mention chip in user bubble, (b) TraceWaterfall inside the
// usage popover after a real turn lands usage rows.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync("shots/mounts", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1560, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });

  // 1. message with an @mention
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill("hey @SprintNotes what is 2+2? answer with just the number");
  await page.keyboard.press("Enter");
  await page.waitForSelector('[data-slot="message-actions"]', { timeout: 150_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "shots/mounts/mention.png" });

  // 2. open usage popover (trigger shows model name near message meta)
  const usageBtn = page.locator('button:has-text("nemotron"), button:has-text("usage"), [aria-label*="usage" i]').first();
  if (await usageBtn.count()) {
    await usageBtn.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: "shots/mounts/usage-popover.png" });
    console.log("trace spans:", await page.locator('[data-slot="trace-waterfall"]').count());
  } else {
    console.log("usage trigger NOT found");
    await page.screenshot({ path: "shots/mounts/no-usage-trigger.png" });
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
