// @ts-nocheck — probe script
// Φ reasoning surface: send prompt on default model (nemotron, effort on),
// assert streaming "Thinking" shimmer label, settled "Thought for Ns" resting
// label + effort chip, expand shows body text, collapse returns resting label.
// Dark theme, screenshots to leopard-shots/reasoning/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/reasoning";

const PROMPT =
  "Think carefully step by step, then answer in one short sentence: what is 17 * 23?";

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ colorScheme: "dark" })).newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300));
  });

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1000);
  await input.click();
  await input.fill(PROMPT);
  await page.keyboard.press("Enter");
  console.log("sent reasoning prompt");

  // streaming phase: panel + "Thinking" shimmer label
  const panel = page.locator('[data-slot="reasoning-panel"]');
  try {
    await panel.waitFor({ timeout: 120_000 });
    const thinking = await page.evaluate(() =>
      (document.querySelector('[data-slot="reasoning-panel"]')?.textContent ?? "").includes("Thinking"),
    );
    console.log("streaming panel present, shows Thinking label:", thinking);
    await page.screenshot({ path: `${SHOTS}/01-streaming.png` });
  } catch {
    console.log("[warn] reasoning panel never appeared during stream");
  }

  // settle
  await page
    .waitForFunction(() => (window as any).__chatStatus === "ready", undefined, { timeout: 420_000 })
    .catch(() => console.log("[warn] status never returned ready"));
  await page.waitForTimeout(1500);

  const settled = await page.evaluate(() => {
    const p = document.querySelector('[data-slot="reasoning-panel"]');
    const text = p?.textContent ?? "";
    const chips = p ? Array.from(p.querySelectorAll("span")).map((s) => s.textContent) : [];
    return {
      hasPanel: !!p,
      hasThoughtFor: /Thought for \d+(\.\d+)?s/.test(text),
      // NB: SwapLabel keeps both labels in the DOM (one hidden) — only the
      // "Thought for Ns" regex is a valid settled assertion.
      hasGenericFallback: !/Thought for/.test(text) && text.includes("Thought process"),
      hasEffortChip: chips.some((t) => t && /^(low|medium|high|max|on)$/i.test(t.trim())),
      labelSnippet: text.slice(0, 120),
    };
  });
  console.log("settled checks:", JSON.stringify(settled, null, 2));
  await page.screenshot({ path: `${SHOTS}/02-settled.png` });

  // expand → body visible; collapse → hidden
  const trigger = panel.locator("button").first();
  await trigger.click();
  await page.waitForTimeout(600);
  const expanded = await page.evaluate(() => {
    const p = document.querySelector('[data-slot="reasoning-panel"]');
    const body = p?.querySelector('[data-state="open"] p, .whitespace-pre-wrap');
    return { bodyLen: body?.textContent?.length ?? 0 };
  });
  console.log("expanded body length:", expanded.bodyLen);
  await page.screenshot({ path: `${SHOTS}/03-expanded.png` });

  await trigger.click();
  await page.waitForTimeout(600);
  const collapsedHidden = await page.evaluate(() => {
    const p = document.querySelector('[data-slot="reasoning-panel"] [data-state]');
    return p ? p.getAttribute("data-state") === "closed" : null;
  });
  console.log("collapsed state ok:", collapsedHidden);
  await page.screenshot({ path: `${SHOTS}/04-collapsed.png` });

  console.log("reasoning probe done");
  await browser.close();
}

main();
