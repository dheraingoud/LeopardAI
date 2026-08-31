import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill(
    "textarea",
    "Show me a simple mermaid flowchart of a login flow (3-4 nodes). Output only the mermaid code block. Do not use any tools.",
  );
  await page.keyboard.press("Enter");
  // Wait for the rendered SVG (debounced live render).
  const deadline = Date.now() + 300_000;
  let svgFound = false;
  while (Date.now() < deadline) {
    svgFound = await page.evaluate(
      () => !!document.querySelector(".cb-mermaid svg, [class*='mermaid'] svg"),
    );
    if (svgFound) break;
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: "shots/mermaid.png" });
  // Reload — persisted text part should re-render the diagram.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(5000);
  const svgAfterReload = await page.evaluate(
    () => !!document.querySelector(".cb-mermaid svg, [class*='mermaid'] svg"),
  );
  console.log(JSON.stringify({ svgFound, svgAfterReload }));
  await browser.close();
}
void main();
