// @ts-nocheck — report default model selector label + POST body model on fresh /chat
import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  await page.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  await page.locator('[data-slot="model-selector-trigger"]').waitFor({ timeout: 60_000 });
  console.log("default label:", (await page.locator('[data-slot="model-selector-trigger"]').innerText()).trim());
  const req = page.waitForRequest((r) => r.url().includes("/api/chat") && r.method() === "POST", { timeout: 120_000 });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.fill("Say OK.");
  await input.press("Enter");
  const body = JSON.parse((await req).postData() ?? "{}");
  console.log("POST model:", body.model);
  const ok = await page.waitForFunction(() => (window as any).__chatStatus === "ready", undefined, { timeout: 240_000 }).then(() => true).catch(() => false);
  console.log("settled:", ok);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
