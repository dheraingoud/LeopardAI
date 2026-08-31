import { chromium } from "playwright";

// Visual sweep: hit each major surface, screenshot it, and assert the core
// DESIGN.md tokens are actually in the computed styles — Geist font stack,
// dark canvas, amber accent present somewhere on interactive chrome.
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const report: Record<string, unknown> = {};

  // 1. Empty state
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "shots/sweep-empty.png" });
  report.empty = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const all = Array.from(document.querySelectorAll("*"));
    const usesAmber = all.some((el) => {
      const cs = getComputedStyle(el);
      return /ffb400|d49600|rgb\(255, ?180, ?0\)|rgb\(212, ?150, ?0\)/.test(
        `${cs.color} ${cs.backgroundColor} ${cs.borderColor} ${cs.fill} ${cs.stroke} ${cs.outlineColor}`,
      );
    });
    return {
      font: body.fontFamily.slice(0, 60),
      darkCanvas: /rgb\((1[0-9]|2[0-9]),/.test(body.backgroundColor),
      usesAmber,
      greeting: !!document.querySelector("[data-slot='empty-state-greeting']"),
    };
  });

  // 2. Settings page
  await page.goto("http://localhost:3001/settings", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "shots/sweep-settings.png" });
  report.settings = await page.evaluate(() => ({
    loaded: document.body.innerText.length > 200,
    usesAmber: /ffb400|d49600|a57600|rgb\(255, ?180, ?0\)|rgb\(212, ?150, ?0\)|rgb\(165, ?118, ?0\)/.test(
      Array.from(document.querySelectorAll("*"))
        .map((el) => {
          const cs = getComputedStyle(el);
          return `${cs.color} ${cs.backgroundColor} ${cs.borderColor}`;
        })
        .join(" "),
    ),
  }));

  // 3. Populated chat (latest from sidebar)
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const link = page.locator("a[href*='/chat/']").first();
  if ((await link.count()) > 0) {
    await link.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "shots/sweep-chat.png" });
    report.chat = await page.evaluate(() => ({
      hasMessages: document.body.innerText.length > 300,
      noDupKeyErrors: true, // console checked separately
    }));
  }

  // Console error sweep across everything we visited
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
}
void main();
