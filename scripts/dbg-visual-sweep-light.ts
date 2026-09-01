// @ts-nocheck — probe script, not app code
// Φ light-mode parity sweep: same states as dark sweep, colorScheme "light".
// Checks #d49600 light-amber tokens, legibility, glass in light mode.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";

async function main() {
  mkdirSync("../shots-sweep-light", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1560, height: 1000 },
    colorScheme: "light",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300));
  });

  // 1. Empty state
  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "../shots-sweep-light/01-empty.png" });

  // 2. Plain streaming response
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill("Say hello in exactly one short sentence.");
  const firstResp = page.waitForResponse(
    (r) => r.url().includes("/api/chat") && r.request().method() === "POST",
    { timeout: 180_000 },
  );
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "../shots-sweep-light/02-streaming.png" });
  await (await firstResp).finished();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "../shots-sweep-light/03-settled.png" });

  // 3. Model selector open (light-mode popover legibility)
  await page.locator('[data-slot="model-selector-trigger"]').click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: "../shots-sweep-light/04-model-selector.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // 4. Composer focus ring (light-mode amber focus)
  await input.click();
  await input.fill("focus check");
  await page.screenshot({ path: "../shots-sweep-light/05-composer-focus.png" });

  await browser.close();
  console.log("light sweep done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
