// Light-theme variant: open latest orchestration chat, force light, screenshot card.
import { chromium } from "playwright";

async function main() {
  const chatId = process.argv[2];
  if (!chatId) throw new Error("usage: dbg-orch-light <chatId>");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1560, height: 1000 }, colorScheme: "light" });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200)); });
  await page.addInitScript(() => { try { localStorage.setItem("theme", "light"); } catch {} });
  await page.goto(`http://localhost:3001/chat/${chatId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "shots/orch/light-collapsed.png" });
  const card = page.locator('[data-slot="agent-run-card"] button').first();
  if (await card.count()) {
    await card.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: "shots/orch/light-expanded.png" });
    console.log("expanded shot ok");
  } else {
    console.log("NO CARD FOUND");
  }
  await browser.close();
}
main();
