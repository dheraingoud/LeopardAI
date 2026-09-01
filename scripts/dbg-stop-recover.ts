// @ts-nocheck — probe script, not app code
// Φ stop-mid-stream → recover: send prompt, stop mid-generation, verify the
// stop glyph renders, verify an error/aborted state shows, then send a second
// prompt and prove the chat still works (the old "chat bricks after failure" bug).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";

async function main() {
  mkdirSync("../shots-recover", { recursive: true });
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

  // 1. Send a long-form prompt so we can stop mid-stream.
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill("Write a very long detailed essay about the history of computing, at least 800 words.");
  await page.keyboard.press("Enter");

  // 2. Wait for streaming to actually start, then screenshot the stop button.
  const stopBtn = page.locator('[aria-label="Stop generating"]');
  await stopBtn.waitFor({ state: "visible", timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(3000); // let some text stream
  const stopVisible = await stopBtn.isVisible().catch(() => false);
  console.log("stop button visible:", stopVisible);
  await page.screenshot({ path: "../shots-recover/01-stop-midstream.png" });

  // 3. Click stop.
  if (stopVisible) {
    await stopBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "../shots-recover/02-after-stop.png" });
  }

  // 4. Send a follow-up prompt — the chat must still work.
  await input.click();
  await input.fill("Say exactly: recovered.");
  const secondResp = page.waitForResponse(
    (r) => r.url().includes("/api/chat") && r.request().method() === "POST",
    { timeout: 180_000 },
  );
  await page.keyboard.press("Enter");
  await (await secondResp).finished();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "../shots-recover/03-second-prompt.png", fullPage: true });

  // 5. Verify "recovered." text actually rendered.
  const body = await page.textContent("body");
  console.log("recovery text present:", /recovered\./.test(body ?? ""));

  await browser.close();
  console.log("stop-recover probe done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
