// Screenshot /dev/showcase (dark + light) to verify the newly mounted fork
// elements render with leopard tokens.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync("shots/showcase", { recursive: true });
  const browser = await chromium.launch();
  for (const theme of ["dark", "light"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 1400 } });
    await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
    const page = await ctx.newPage();
    await page.goto("http://localhost:3001/dev/showcase", { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `shots/showcase/${theme}.png`, fullPage: true });
    await ctx.close();
    console.log(`${theme} ok`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
