// @ts-nocheck — probe script, not app code
// Φ surface 9 (stop mid-stream → recover):
//  1. send long prompt, wait for streaming, stop button visible (glyph shot)
//  2. click stop → partial text KEPT, status returns ready, composer usable
//  3. follow-up prompt works → chat not bricked (the old stop-bricks-chat bug)
// Screenshots → C:/Users/HP/leopard-shots/stop-recover/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/stop-recover";

async function waitReady(page, timeout = 420_000) {
  await page
    .waitForFunction(() => window.__chatStatus === "ready", undefined, { timeout })
    .catch(() => console.log("[warn] status never returned ready"));
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
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

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await page.waitForSelector('[data-slot="composer-bar"] textarea', { timeout: 60_000 });
  await waitReady(page, 120_000);

  // 1. Long-form prompt; stop mid-stream.
  await input.click();
  await input.fill("Write a very long detailed essay about the history of computing, at least 800 words.");
  await page.keyboard.press("Enter");

  const stopBtn = page.locator('[aria-label="Stop generating"]');
  await stopBtn.waitFor({ state: "visible", timeout: 90_000 }).catch(() => null);
  // Wait until some text has actually streamed before stopping.
  await page
    .waitForFunction(
      () =>
        (document.querySelector('[data-slot="message-pair"]')?.innerText ?? "").length > 120,
      undefined,
      { timeout: 120_000 },
    )
    .catch(() => console.log("[warn] no streamed text before stop"));
  const stopVisible = await stopBtn.isVisible().catch(() => false);
  console.log("stop button visible:", stopVisible);
  await page.screenshot({ path: `${SHOTS}/01-stop-midstream.png` });

  // 2. Stop → partial kept, status ready.
  let partialChars = 0;
  if (stopVisible) {
    const before = await page.evaluate(
      () => document.querySelector('[data-slot="message-pair"]')?.innerText ?? "",
    );
    await stopBtn.click();
    await waitReady(page, 60_000);
    await page.waitForTimeout(1200);
    const after = await page.evaluate(
      () => document.querySelector('[data-slot="message-pair"]')?.innerText ?? "",
    );
    partialChars = after.length;
    console.log(
      "partial kept:",
      after.length > 80,
      `(${before.length} chars at stop, ${after.length} after)`,
    );
    await page.screenshot({ path: `${SHOTS}/02-after-stop.png` });
  }

  // 3. Follow-up — chat must not be bricked. Right after stop the server row
  // can still read `streaming` for a beat (abort → finalize write → Convex
  // push), so isStreaming is briefly true and the send is ENQUEUED; the queue
  // drains when the mirror clears serverStreaming. Wait for the actual POST
  // (proves the drain fired), not just a ready status (which is already true).
  await input.click();
  await input.fill("Say exactly: recovered.");
  const followupPost = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().includes("/api/chat") && !r.url().includes("/stop"),
    { timeout: 120_000 },
  );
  await page.keyboard.press("Enter");
  const sent = await followupPost.then(() => true).catch(() => false);
  console.log("follow-up POST fired (queue drained):", sent);
  await waitReady(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/03-second-prompt.png`, fullPage: true });

  const body = await page.evaluate(() => document.body?.innerText ?? "");
  const final = await page.evaluate(() => ({
    status: window.__chatStatus,
    pairs: document.querySelectorAll('[data-slot="message-pair"]').length,
  }));
  console.log("recovery text present:", /recovered\./.test(body));
  console.log("final:", JSON.stringify(final), "partialChars:", partialChars);

  await browser.close();
  console.log("stop-recover probe done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
