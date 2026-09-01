// @ts-nocheck — probe script
// Φ surface 5 (web search): force a webSearch tool call, assert:
//  - streaming per-call row ("searching web…") — NO group pill
//  - settled "Searched the web" row, expandable Request/Result
//  - sources row (data-slot="sources") appears after settle
//  - no model names anywhere in the rendered turn
// Screenshots → C:/Users/HP/leopard-shots/websearch/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/websearch";

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200));
  });

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-slot="composer-bar"] textarea', { timeout: 60_000 });

  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill(
    "Use the webSearch tool to search the web for: latest Next.js release version. Then answer in one short sentence.",
  );
  await page.keyboard.press("Enter");
  console.log("sent search prompt");

  // streaming tool row appears (or skips straight to settled on fast runs)
  const sawRunning = await page
    .waitForFunction(
      () => (document.body?.innerText ?? "").toLowerCase().includes("searching web"),
      undefined,
      { timeout: 120_000 },
    )
    .then(() => true)
    .catch(() => false);
  console.log("saw streaming tool row:", sawRunning);
  await page.screenshot({ path: `${SHOTS}/01-streaming.png` });

  // settle gate — nemotron streams can run minutes
  await page
    .waitForFunction(() => window.__chatStatus === "ready", undefined, { timeout: 420_000 })
    .catch(() => console.log("[warn] status never returned ready"));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/02-settled.png`, fullPage: true });

  const checks = await page.evaluate(() => {
    const body = document.body?.innerText ?? "";
    const toolRows = document.querySelectorAll('[data-slot="tool-call"]');
    const sources = document.querySelector('[data-slot="sources"]');
    return {
      settledLabel: body.includes("Searched the web"),
      toolRowCount: toolRows.length,
      hasSourcesRow: !!sources,
      sourcesText: sources ? sources.textContent.slice(0, 160) : null,
      // no model ids/names should leak into the turn (model selector is
      // allowed to show its own name — exclude that subtree)
      noModelLeak: (() => {
        const sel = document.querySelector('[data-slot="model-selector-trigger"]');
        const selText = sel ? sel.innerText.trim() : "\0";
        const txt = body.split(selText).join("");
        return !/nemotron|nim\/|\/models\//i.test(txt);
      })(),
    };
  });
  console.log("settled checks:", JSON.stringify(checks, null, 2));

  // expand the tool row → Request/Result disclosure
  const row = page.locator('[data-slot="tool-call"] button').first();
  if (await row.count()) {
    await row.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/03-expanded.png` });
    const expanded = await page.evaluate(() => {
      const body = document.body?.innerText ?? "";
      return { showsResult: /Result|latest\.|nextjs/i.test(body) };
    });
    console.log("expanded:", JSON.stringify(expanded));
  } else {
    console.log("[warn] no tool row to expand");
  }

  await browser.close();
  console.log("websearch probe done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
