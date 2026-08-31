import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill(
    "textarea",
    'Reply with ONLY this code fence, no other text:\n```chart\n{"title":"Big Cat Weights","series":[{"label":"Tiger","value":220},{"label":"Lion","value":190},{"label":"Leopard","value":60}]}\n```',
  );
  await page.keyboard.press("Enter");
  const deadline = Date.now() + 300_000;
  let chartFound = false;
  while (Date.now() < deadline) {
    chartFound = await page.evaluate(
      () => /Big Cat Weights/.test(document.body.innerText) && !!document.querySelector("[data-slot='bar-chart']"),
    );
    if (chartFound) break;
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: "shots/chart.png" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(5000);
  const chartAfterReload = await page.evaluate(
    () => /Big Cat Weights/.test(document.body.innerText) && !!document.querySelector("[data-slot='bar-chart']"),
  );
  console.log(JSON.stringify({ chartFound, chartAfterReload }));
  await browser.close();
}
void main();
