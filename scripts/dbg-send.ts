import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill("textarea", "Say OK. No tools.");
  await page.keyboard.press("Enter");
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(3000);
    const s = await page.evaluate(() => ({
      status: (window as any).__chatStatus,
      working: /Working on it/i.test(document.body.innerText),
      len: document.body.innerText.length,
    }));
    console.log(i, JSON.stringify(s));
    if (s.status === "ready" && s.len > 500) break;
  }
  await browser.close();
}
void main();
