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
  await page.waitForTimeout(75_000);
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
