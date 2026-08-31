import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill(
    "textarea",
    "Think step by step: is 917 a prime number? Show brief reasoning then answer.",
  );
  await page.keyboard.press("Enter");
  // Wait for the run to START (status is "ready" at page load — without this
  // gate the settle check passes instantly before the run even begins).
  await page.waitForFunction(
    () => (window as any).__chatStatus === "submitted" || (window as any).__chatStatus === "streaming",
    undefined,
    { timeout: 120_000 },
  );
  // …then for it to settle.
  await page.waitForFunction(
    () => (window as any).__chatStatus === "ready",
    undefined,
    { timeout: 300_000 },
  );
  await page.waitForTimeout(1500);
  const result = await page.evaluate(() => {
    const body = document.body.innerText;
    const hasHidden = /reasoning is hidden|hidden reasoning/i.test(body);
    const panelMarker = /Thought( for \d+s)?|Thinking/.test(body);
    return { hasHidden, panelMarker };
  });
  // Expand the panel (auto-collapses when done) and measure its content.
  await page.getByText(/^Thought/).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const contentLen = await page.evaluate(() => {
    const triggers = Array.from(document.querySelectorAll("[class*='trigger']"));
    const panel = triggers
      .map((t) => t.parentElement)
      .find((p) => p && /Thought|Thinking/.test((p as HTMLElement).innerText));
    return panel ? (panel as HTMLElement).innerText.length : 0;
  });
  console.log(JSON.stringify({ ...result, contentLen }));
  await page.screenshot({ path: "shots/verify-reasoning.png" });
  await browser.close();
}
void main();
