import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill("textarea", "Think step by step: is 917 a prime number? Show brief reasoning then answer.");
  await page.keyboard.press("Enter");
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => ({
      status: (window as any).__chatStatus,
      url: location.pathname,
    }));
    console.log(i * 5 + "s", JSON.stringify(s));
    if (s.status === "ready" && i > 0) break;
  }
  await browser.close();
}
void main();
