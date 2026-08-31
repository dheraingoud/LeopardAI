import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill("textarea", "In one short sentence: what color is a leopard's coat? Answer directly without using any tools.");
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => document.body.innerText.length > 400 && !document.querySelector(".leopard-stream-caret"),
    { timeout: 120_000 },
  );
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => ({
    actions: document.querySelectorAll("[data-slot='message-actions']").length,
    actionReveal: document.querySelectorAll(".action-reveal").length,
    copyBtns: Array.from(document.querySelectorAll("button[aria-label*='Copy']")).length,
    body: document.body.innerText.slice(-300),
  }));
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: "shots/dbg-actions.png" });
  await browser.close();
}
void main();
