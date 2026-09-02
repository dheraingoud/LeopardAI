// Dead-chat repro: force every web search to fail (route abort), let the
// turn terminate, then send a follow-up and verify the chat still responds.
// Prints a verdict JSON. Exit 1 when the follow-up never streams.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync("C:/Users/HP/leopard-shots/fail", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1560, height: 1000 } });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300));
  });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill("Search the web for today's spiking neural network news and summarize.");
  await page.keyboard.press("Enter");

  // Turn terminates (search fails). Wait until composer is usable again.
  await page.waitForTimeout(90_000);
  await page.screenshot({ path: "C:/Users/HP/leopard-shots/fail/1-terminated.png", fullPage: true });

  // Follow-up in the SAME chat — the bug: this never streams.
  await input.click();
  await input.fill("Reply with exactly: alive");
  await page.keyboard.press("Enter");

  let recovered = false;
  try {
    await page.waitForFunction(
      () => document.body.innerText.includes("alive"),
      undefined,
      { timeout: 150_000 },
    );
    recovered = true;
  } catch {
    recovered = false;
  }
  await page.screenshot({ path: "C:/Users/HP/leopard-shots/fail/2-followup.png", fullPage: true });
  console.log(JSON.stringify({ recovered }));
  await browser.close();
  process.exit(recovered ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
