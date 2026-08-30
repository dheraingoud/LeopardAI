import { chromium } from "playwright";

// ```svg fence: settled render sanitizes + inlines the SVG art (no
// foreignObject/script), and the source toggle exists. Reload must keep it.
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill(
    "textarea",
    'Reply with ONLY this code fence, nothing else:\n```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#ffb400"/><script>alert(1)</script></svg>\n```',
  );
  await page.keyboard.press("Enter");
  const deadline = Date.now() + 120_000;
  let live = { art: false, sanitized: true };
  while (Date.now() < deadline) {
    live = await page.evaluate(() => ({
      art: !!document.querySelector(".cb-svg-art svg circle"),
      sanitized: !document.querySelector(".cb-svg-art script"),
    }));
    if (live.art && live.sanitized) break;
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: "shots/svg.png" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(5000);
  const reloaded = await page.evaluate(() => ({
    art: !!document.querySelector(".cb-svg-art svg circle"),
    sanitized: !document.querySelector(".cb-svg-art script"),
  }));
  console.log(JSON.stringify({ live, reloaded }));
  await browser.close();
}
void main();
