// @ts-nocheck — probe script
// Φ empty state: /chat first paint — greeting, composer present, glimmer
// pseudo-element active (animated angle changes), placeholder, focus ring,
// no horizontal overflow. Dark + light. No model call.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/empty";

async function snap(page, scheme, tag) {
  await page.emulateMedia({ colorScheme: scheme });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-slot="composer-bar"] textarea').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2500);

  const checks = await page.evaluate(() => {
    const comp = document.querySelector(".composer-glimmer");
    const ta = document.querySelector('[data-slot="composer-bar"] textarea');
    const cs = comp ? getComputedStyle(comp, "::before") : null;
    const angle1 = cs ? cs.getPropertyValue("--composer-glimmer-angle") : "";
    return {
      hasComposer: !!comp,
      hasTextarea: !!ta,
      glimmerAnimated: cs ? cs.animationName !== "none" : false,
      glimmerAngleSample: angle1,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      bodySnippet: (document.body?.innerText ?? "").slice(0, 200),
    };
  });
  // sample angle twice 2s apart to prove animation runs
  const a1 = checks.glimmerAngleSample;
  await page.waitForTimeout(2000);
  const a2 = await page.evaluate(() => {
    const comp = document.querySelector(".composer-glimmer");
    return comp ? getComputedStyle(comp, "::before").getPropertyValue("--composer-glimmer-angle") : "";
  });
  console.log(`[${tag}]`, JSON.stringify({ ...checks, angleMoved: a1 !== a2 }));
  await page.screenshot({ path: `${SHOTS}/${tag}.png` });

  // focus ring check
  await page.click('[data-slot="composer-bar"] textarea');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${tag}-focus.png` });
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  await snap(page, "dark", "01-dark");
  await snap(page, "light", "02-light");
  console.log("empty-state probe done");
  await browser.close();
}

main();
