// @ts-nocheck — probe script
// Φ error UX: block /api/chat via route interception → the client must render a
// graceful error state (no white-screen, composer stays usable). Then unblock
// and prove a follow-up streams normally.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";

async function main() {
  mkdirSync("../shots-error-ui", { recursive: true });
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

  // 1. Block the chat API → simulate a hard network failure.
  await page.route("**/api/chat**", (r) => r.abort("failed"));
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill("Hello, anyone there?");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(6000);
  await page.screenshot({ path: "../shots-error-ui/1-failed.png", fullPage: true });

  const body1 = (await page.textContent("body")) ?? "";
  // What does the error state look like?
  const markers = [
    "error", "Error", "failed", "Failed", "retry", "Retry",
    "went wrong", "try again", "Try again",
  ];
  const found = markers.filter((m) => body1.includes(m));
  console.log("error markers found:", JSON.stringify(found));

  // Composer must stay usable even after the failure.
  const composerEnabled = await input.isEnabled();
  console.log("composer enabled after failure:", composerEnabled);

  // 2. Unblock and send a follow-up — must stream and complete.
  await page.unroute("**/api/chat**");
  await input.click();
  await input.fill("Say exactly: back online.");
  await page.keyboard.press("Enter");

  let recovered = false;
  try {
    await page.waitForFunction(
      () => document.body.innerText.includes("back online"),
      undefined,
      { timeout: 120_000 },
    );
    recovered = true;
  } catch {
    recovered = false;
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "../shots-error-ui/2-recovered.png", fullPage: true });
  console.log("recovered:", recovered);

  await browser.close();
  console.log("error-ui probe done");
  if (!recovered) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
