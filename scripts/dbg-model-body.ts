// @ts-nocheck — capture the model id in the POST /api/chat body after selecting Flash.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  let sentModel: string | null = null;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/chat") && r.method() === "POST") {
      try {
        const b = JSON.parse(r.postData() ?? "{}");
        sentModel = b.model ?? null;
        console.log("POST body model:", JSON.stringify(b.model), "keys:", Object.keys(b).join(","));
      } catch (e) { console.log("body parse fail", e); }
    }
  });
  await page.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.waitFor({ timeout: 60_000 });
  await page.locator('[data-slot="model-selector-trigger"]').click();
  await page.waitForTimeout(600);
  await page.locator('[data-slot="model-selector-item"]', { hasText: "DeepSeek V4 Flash" }).first().click();
  await page.waitForTimeout(600);
  console.log("trigger label:", (await page.locator('[data-slot="model-selector-trigger"]').innerText()).trim());
  await input.click();
  await input.fill("ping — reply with one word");
  await input.press("Enter");
  await page.waitForTimeout(8000);
  console.log("sentModel:", sentModel);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
