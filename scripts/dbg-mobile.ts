// @ts-nocheck — probe script
// Φ mobile viewport: 390x844, touch. Empty state, composer, streaming,
// settled — no horizontal overflow, composer visible/usable, text legible.
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";

async function main() {
  mkdirSync("../shots-mobile", { recursive: true });
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

  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "../shots-mobile/01-empty.png" });

  // Horizontal overflow check
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  console.log("horizontal overflow px:", overflow);

  // Composer visible + usable on mobile
  const input = page.locator('[data-slot="composer-bar"] textarea');
  const inputBox = await input.boundingBox();
  console.log("composer bbox:", JSON.stringify(inputBox));
  await input.tap();
  await input.fill("Say exactly: mobile works.");
  await page.screenshot({ path: "../shots-mobile/02-typing.png" });
  await page.keyboard.press("Enter");

  await page.waitForTimeout(3000);
  await page.screenshot({ path: "../shots-mobile/03-streaming.png" });

  let done = false;
  try {
    await page.waitForFunction(
      () => document.body.innerText.includes("mobile works"),
      undefined,
      { timeout: 120_000 },
    );
    done = true;
  } catch {
    done = false;
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "../shots-mobile/04-settled.png", fullPage: true });
  console.log("settled:", done);

  const overflowAfter = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  console.log("horizontal overflow after:", overflowAfter);

  await browser.close();
  console.log("mobile probe done");
  if (!done || overflow > 1 || overflowAfter > 1) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
