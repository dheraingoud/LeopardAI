import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const reqs: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes("convex") || u.includes("skill")) reqs.push(u.slice(0, 120));
  });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      console.log("[console]", m.type(), m.text().slice(0, 200));
  });

  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000); // let convex seed+query settle

  const ta = page.locator("textarea").first();
  await ta.fill("/");
  await page.waitForTimeout(800);

  const info = await page.evaluate(() => {
    const menu = document.querySelector('[data-slot="slash-menu"]');
    const mention = document.querySelector('[data-slot="mention-menu"]');
    return {
      slashMenuPresent: !!menu,
      mentionPresent: !!mention,
      bodyHasListbox: !!document.querySelector('[role="listbox"]'),
    };
  });
  console.log(info);
  console.log("convex reqs:", reqs.length, reqs.slice(0, 5));
  await page.screenshot({ path: "probe-slash-debug.png" });
  await browser.close();
}
main().catch((e) => (console.error(e), process.exit(1)));
