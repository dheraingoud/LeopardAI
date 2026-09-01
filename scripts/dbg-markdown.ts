// @ts-nocheck — probe script
// Φ markdown rendering: one turn asking for headers, bold, list, inline
// code, fenced code block, LaTeX, mermaid. Asserts rendered DOM nodes.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/markdown";

const PROMPT = `Reply with ONLY the following markdown, verbatim, no commentary:

# Demo Title
Some **bold text** and \`inline code\`.
- first item
- second item

\`\`\`js
const x = 42;
\`\`\`

Inline math: $E = mc^2$.

\`\`\`mermaid
graph TD
  A --> B
\`\`\``;

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
  console.log("sent markdown prompt");

  // wait for the mermaid fence (last element) then settle
  try {
    await page.waitForFunction(
      () => (document.body?.innerText ?? "").includes("graph TD"),
      undefined,
      { timeout: 300_000 },
    );
    console.log("mermaid source seen");
  } catch {
    console.log("[timeout] mermaid fence never appeared; body tail:");
    console.log((await page.evaluate(() => document.body?.innerText ?? "")).slice(-800));
  }
  // let stream finish + mermaid compile
  await page
    .waitForFunction(() => (window as any).__chatStatus === "ready", undefined, { timeout: 420_000 })
    .catch(() => console.log("[warn] status never returned ready"));
  // mermaid renders async (dynamic import + debounce) after settle
  await page
    .waitForSelector(".cb-mermaid svg", { timeout: 30_000 })
    .catch(() => console.log("[warn] mermaid svg never appeared"));
  await page.waitForTimeout(2000);

  const checks = await page.evaluate(() => {
    const body = document.body?.innerText ?? "";
    return {
      h1: document.querySelectorAll("h1").length,
      strong: document.querySelectorAll("strong").length,
      li: document.querySelectorAll("li").length,
      inlineCode: document.querySelectorAll("code:not(pre code)").length,
      preBlocks: document.querySelectorAll("pre").length,
      katex: document.querySelectorAll(".katex").length,
      mermaidSvg: document.querySelectorAll(".cb-mermaid svg").length,
      anySvg: document.querySelectorAll("svg").length,
      hasTitle: body.includes("Demo Title"),
      hasBold: body.includes("bold text"),
      hasMath: body.includes("E = mc"),
    };
  });
  console.log("checks:", JSON.stringify(checks, null, 2));
  await page.screenshot({ path: `${SHOTS}/01-settled.png`, fullPage: false });
  console.log("markdown probe done");
  await browser.close();
}

main();
