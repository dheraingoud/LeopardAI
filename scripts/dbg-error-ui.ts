// @ts-nocheck — probe script
// Φ surface 10 (error UX): block /api/chat via route interception → the client
// must render a graceful error state (no white-screen, composer stays usable,
// status returns ready). Then unblock and prove a follow-up streams + settles.
// Screenshots → C:/Users/HP/leopard-shots/error-ui/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/error-ui";

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

  // 1. Block the chat API → simulate a hard network failure.
  await page.route("**/api/chat**", (r) => r.abort("failed"));
  await input.click();
  await input.fill("Hello, anyone there?");
  await page.keyboard.press("Enter");
  // Wait for the status machine to leave ready (attempt started) and return
  // (error surfaced), not a fixed sleep.
  await page
    .waitForFunction(() => window.__chatStatus !== "ready", undefined, { timeout: 30_000 })
    .catch(() => console.log("[warn] status never left ready"));
  await waitReady(page, 120_000);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/1-failed.png`, fullPage: true });

  const body1 = (await page.evaluate(() => document.body?.innerText ?? "")) as string;
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
  const followupPost = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().includes("/api/chat") && !r.url().includes("/stop"),
    { timeout: 120_000 },
  );
  await page.keyboard.press("Enter");
  const sent = await followupPost.then(() => true).catch(() => false);
  console.log("follow-up POST fired:", sent);
  await waitReady(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/2-recovered.png`, fullPage: true });

  const body2 = (await page.evaluate(() => document.body?.innerText ?? "")) as string;
  const recovered = body2.includes("back online");
  console.log("recovered:", recovered);

  await browser.close();
  console.log("error-ui probe done");
  if (!recovered) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
