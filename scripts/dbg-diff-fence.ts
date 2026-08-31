// Ask for a small unified diff, then screenshot the settled ReviewableDiff.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync("shots/diff", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1560, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill(
    'Reply with ONLY a ```diff fenced block (no other text) showing a small unified diff that renames a function `getName` to `getFullName` in `user.ts`. Use + and - lines.',
  );
  await page.keyboard.press("Enter");
  await page.waitForSelector('[data-slot="message-actions"]', { timeout: 150_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "shots/diff/settled.png", fullPage: true });
  const has = await page.locator('[data-slot="reviewable-diff"]').count();
  console.log("reviewable-diff count:", has);
  if (has > 0) {
    // click Keep on hunk 1, then Apply, verify clipboard path fires toast
    const keep = page.locator('button[aria-label^="Keep hunk"]').first();
    if (await keep.count()) await keep.click();
    await page.waitForTimeout(400);
    const apply = page.locator("button", { hasText: "Apply" }).first();
    if (await apply.count()) {
      await apply.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: "shots/diff/after-apply.png", fullPage: true });
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
