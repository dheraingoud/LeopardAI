// @ts-nocheck — probe script
// Φ surface 13 (model selector): popover opens, 8 models listed, styling in
// BOTH themes, switching models updates the trigger label and survives.
// Screenshots → C:/Users/HP/leopard-shots/model-selector/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/model-selector";

async function open(page) {
  await page.locator('[data-slot="model-selector-trigger"]').click();
  await page.waitForSelector('[data-slot="model-selector-content"]', { timeout: 10_000 });
  await page.waitForTimeout(400);
}

async function state(page) {
  const el = page.locator('[data-slot="model-selector-content"]');
  const items = await page.locator('[data-slot="model-selector-item"]').count();
  const names = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-slot="model-selector-item"]')).map((i) =>
      (i.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60),
    ),
  );
  return { items, names, text: (await el.innerText()).slice(0, 400) };
}

async function run(theme) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1560, height: 1000 },
    colorScheme: theme,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${theme}][pageerror]`, String(e).slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[${theme}][console.error]`, m.text().slice(0, 300));
  });

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-slot="model-selector-trigger"]', { timeout: 60_000 });
  await page.waitForTimeout(1200);

  const triggerBefore = (
    await page.locator('[data-slot="model-selector-trigger"]').innerText()
  ).trim();
  await open(page);
  const s = await state(page);
  console.log(`[${theme}] items:`, s.items);
  console.log(`[${theme}] names:`, JSON.stringify(s.names, null, 1));
  await page.locator('[data-slot="model-selector-content"]').screenshot({
    path: `${SHOTS}/${theme}-popover.png`,
  });

  // Switch: pick the LAST item (different from the current selection),
  // trigger label must change.
  await page.locator('[data-slot="model-selector-item"]').last().click();
  await page.waitForTimeout(700);
  const triggerAfter = (
    await page.locator('[data-slot="model-selector-trigger"]').innerText()
  ).trim();
  console.log(`[${theme}] trigger: "${triggerBefore}" → "${triggerAfter}"`);
  console.log(`[${theme}] switched:`, triggerBefore !== triggerAfter);
  await page.screenshot({ path: `${SHOTS}/${theme}-after-switch.png` });

  await browser.close();
  return { items: s.items, switched: triggerBefore !== triggerAfter };
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const dark = await run("dark");
  const light = await run("light");
  console.log("summary:", JSON.stringify({ dark, light }));
  console.log("model-selector probe done");
  if (dark.items < 8 || light.items < 8 || !dark.switched || !light.switched) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
