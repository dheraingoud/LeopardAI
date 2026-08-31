import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1560, height: 1000 } });
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: "shots/tour/01-empty.png" });
  // composer focus
  const ta = p.locator('[data-slot="composer-bar"] textarea');
  await ta.click();
  await p.screenshot({ path: "shots/tour/02-composer-focus.png" });
  // model selector open
  await p.locator('[data-slot="model-selector"]').first().click().catch(() => {});
  await p.waitForTimeout(600);
  await p.screenshot({ path: "shots/tour/03-model-picker.png" });
  await p.keyboard.press("Escape");
  // send a prompt that yields markdown + code
  await ta.fill("Show me a markdown demo: a heading, a bullet list, a small table, and a python code block. Keep it short.");
  await ta.press("Enter");
  await p.waitForTimeout(2500);
  await p.screenshot({ path: "shots/tour/04-streaming.png" });
  await p.waitForSelector('[data-slot="message-actions"]', { timeout: 150_000 });
  await p.waitForTimeout(1000);
  await p.screenshot({ path: "shots/tour/05-settled.png" });
  // hover assistant message → action bar
  const pair = p.locator('[data-slot="message-pair"]').last();
  await pair.hover();
  await p.waitForTimeout(400);
  await p.screenshot({ path: "shots/tour/06-actions.png" });
  console.log("url:", p.url());
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
