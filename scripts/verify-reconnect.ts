import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill(
    "textarea",
    "Write a long detailed essay (at least 600 words) about the evolution of big cats. Answer directly without using any tools.",
  );
  await page.keyboard.press("Enter");
  // Wait for streaming to visibly start, then reload MID-generation.
  await page.waitForTimeout(12_000);
  const urlBefore = page.url();
  const textBefore = await page.evaluate(() => document.body.innerText.length);
  await page.reload({ waitUntil: "domcontentloaded" });
  // The bubble should reappear and keep GROWING (live mirror patches parts).
  await page.waitForTimeout(4000);
  const sample1 = await page.evaluate(() => document.body.innerText.length);
  await page.waitForTimeout(8000);
  const sample2 = await page.evaluate(() => document.body.innerText.length);
  const sameChat = page.url() === urlBefore;
  const keptGrowing = sample2 > sample1 + 40;
  console.log(JSON.stringify({ sameChat, textBefore, sample1, sample2, keptGrowing }));
  await page.screenshot({ path: "shots/reconnect.png" });
  await browser.close();
}
void main();
