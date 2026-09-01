// @ts-nocheck — probe script, not app code
// Φ visual sweep (dark mode): empty state → plain stream → search rows →
// reasoning row → model selector open → edit-and-resend → sidebar state.
// Screenshots land in ../shots-sweep/ (outside the Next project).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";

async function main() {
  mkdirSync("../shots-sweep", { recursive: true });
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

  // 1. Empty state
  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "../shots-sweep/01-empty.png" });

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
  await page.screenshot({ path: "../shots-sweep/02-streaming.png" });
  await (await firstResp).finished();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "../shots-sweep/03-settled.png" });

  // 3. Web search rows (force a search turn)
  await input.click();
  await input.fill(
    "Use web search: what is the latest stable Next.js version? One short answer.",
  );
  const searchResp = page.waitForResponse(
    (r) => r.url().includes("/api/chat") && r.request().method() === "POST",
    { timeout: 300_000 },
  );
  await page.keyboard.press("Enter");
  // catch mid-search state (pill or rows visible)
  await page.waitForTimeout(12000);
  await page.screenshot({ path: "../shots-sweep/04-search-live.png" });
  await (await searchResp).finished();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "../shots-sweep/05-search-settled.png", fullPage: true });

  // 4. Model selector open
  await page.locator('[data-slot="model-selector-trigger"]').click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: "../shots-sweep/06-model-selector.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // 5. Edit-and-resend: hover last user message → edit → tweak → save
  const userMsg = page.locator('[data-slot="message-pair"]').last();
  await userMsg.hover();
  const editBtn = page.locator('[aria-label="Edit and resend"]').last();
  await editBtn.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "../shots-sweep/07-editing.png" });
  const editor = page.locator('[data-slot="edit-message"] textarea');
  await editor.fill("Actually — answer with just the version number.");
  const editResp = page.waitForResponse(
    (r) => r.url().includes("/api/chat") && r.request().method() === "POST",
    { timeout: 300_000 },
  );
  await page.locator('[data-slot="edit-message"] button:has-text("Save")').click();
  await (await editResp).finished();
  // wait until the turn settles — stop button gone — before shooting
  await page
    .locator('[aria-label="Stop generating"]')
    .waitFor({ state: "hidden", timeout: 120_000 })
    .catch(() => null);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "../shots-sweep/08-edit-resend.png" });

  // 6. Sidebar (history) — always-on in desktop layout; plain final shot.
  await page.waitForTimeout(600);
  await page.screenshot({ path: "../shots-sweep/09-sidebar.png" });

  await browser.close();
  console.log("sweep done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
