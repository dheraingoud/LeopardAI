import { chromium } from "playwright";

// Console sweep: capture page errors + console.error across empty state, a
// live generation, settings, and a reload of a populated chat.
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`);
  });

  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  await page.fill(
    "textarea",
    "In one sentence: what is a leopard? Answer directly without using any tools.",
  );
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () =>
      /leopard/i.test(document.body.innerText) &&
      !/Working on it/i.test(document.body.innerText),
    { timeout: 120_000 },
  );

  await page.goto("http://localhost:3001/settings", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.goBack({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  // Filter noise: chunk-load retries, favicon, React DevTools banner, clerk telemetry.
  const real = errors.filter(
    (e) =>
      !/favicon|DevTools|clerk\.js|telemetry|ChunkLoadError|hot-reload|Fast Refresh/i.test(
        e,
      ),
  );
  console.log(JSON.stringify({ total: errors.length, real: real.slice(0, 10) }, null, 1));
  await browser.close();
}
void main();
