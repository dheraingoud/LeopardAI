// @ts-nocheck
import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1560, height: 1000 } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const stamp = (l: string) => console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, l);
  page.on("console", (m) => {
    const txt = m.text();
    if (m.type() === "error" || txt.startsWith("[navtrace]")) stamp(txt.slice(0, 1500));
  });
  await page.addInitScript(() => {
    const wrap = (obj: any, key: string) => {
      const orig = obj[key];
      obj[key] = function (...args: any[]) {
        console.log(`[navtrace] ${key}(${args.map((a) => String(a)).slice(0, 2).join(",")})\n${new Error("trace").stack}`);
        return orig.apply(this, args);
      };
    };
    wrap(window.history, "pushState");
    wrap(window.history, "replaceState");
    try {
      Object.defineProperty(window.location, "reload", {
        value: () => console.log(`[navtrace] location.reload\n${new Error("trace").stack}`),
      });
    } catch {}
  });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill("Use a team of subagents for this: research the latest Next.js caching changes, then write a short summary, then have another agent verify it. Use spawn_agents.");
  await page.keyboard.press("Enter");
  stamp("sent");
  const card = page.locator('[data-slot="approval-card"]');
  await card.waitFor({ timeout: 120_000 });
  stamp("approval visible");
  await card.locator('button:has-text("Allow")').click();
  stamp("clicked Allow — passive 60s");
  for (let i = 0; i < 12; i++) await page.waitForTimeout(5000);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
