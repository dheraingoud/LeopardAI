// @ts-nocheck — why didn't Enter send after model select?
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync("C:/Users/HP/leopard-shots/orch-flash", { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  page.on("request", (r) => { if (r.url().includes("/api/chat")) console.log("[req]", r.method(), r.url()); });
  await page.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.waitFor({ timeout: 60_000 });

  await page.locator('[data-slot="model-selector-trigger"]').click();
  await page.waitForTimeout(600);
  await page.locator('[data-slot="model-selector-item"]', { hasText: "DeepSeek V4 Flash" }).first().click();
  await page.waitForTimeout(500);

  await input.click();
  await input.fill("hello — reply with one word");
  await page.waitForTimeout(400);
  const val = await input.inputValue();
  const disabled = await page.locator('[data-slot="composer-send"]').isDisabled();
  console.log("textarea value:", JSON.stringify(val), "sendDisabled:", disabled);
  await page.screenshot({ path: "C:/Users/HP/leopard-shots/orch-flash/dbg-before-enter.png" });
  await input.press("Enter");
  await page.waitForTimeout(3000);
  console.log("status after enter:", await page.evaluate(() => (window as any).__chatStatus));
  await page.screenshot({ path: "C:/Users/HP/leopard-shots/orch-flash/dbg-after-enter.png" });
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
