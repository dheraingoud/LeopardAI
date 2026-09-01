// @ts-nocheck — probe script
// Φ surface 15 (mobile 390x844, touch): empty state, composer, streaming,
// settled — no horizontal overflow, composer visible/usable, reply settles.
// Screenshots → C:/Users/HP/leopard-shots/mobile/
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/mobile";

async function waitReady(page, timeout = 420_000) {
  await page
    .waitForFunction(() => window.__chatStatus === "ready", undefined, { timeout })
    .catch(() => console.log("[warn] status never returned ready"));
}

async function overflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices["iPhone 13"],
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
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/01-empty.png` });

  console.log("horizontal overflow px:", await overflow(page));

  // Composer visible + usable on mobile
  const inputBox = await input.boundingBox();
  console.log("composer bbox:", JSON.stringify(inputBox));
  await input.tap();
  await input.fill("Say exactly: mobile works.");
  await page.screenshot({ path: `${SHOTS}/02-typing.png` });
  await page.keyboard.press("Enter");

  await page
    .waitForFunction(() => window.__chatStatus !== "ready", undefined, { timeout: 30_000 })
    .catch(() => console.log("[warn] status never left ready"));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/03-streaming.png` });

  await waitReady(page);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/04-settled.png`, fullPage: true });

  const body = await page.evaluate(() => document.body?.innerText ?? "");
  const settled = body.includes("mobile works.");
  console.log("settled:", settled);
  console.log("horizontal overflow after:", await overflow(page));

  await browser.close();
  console.log("mobile probe done");
  if (!settled) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
