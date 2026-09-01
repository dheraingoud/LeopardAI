// @ts-nocheck — probe: send on an EXISTING chat, watch __chatStatus transitions.
import { chromium } from "playwright";

const CHAT = process.argv[2] ?? "j57eybbrm6sdc6eyw1wxtacd458dkjaw";

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300));
  });
  page.on("request", (r) => {
    if (r.url().includes("/api/chat")) console.log("[req]", r.method(), r.url());
  });
  page.on("response", (r) => {
    if (r.url().includes("/api/chat")) console.log("[resp]", r.status(), r.url());
  });

  await page.goto(`http://localhost:3001/chat/${CHAT}`, { waitUntil: "domcontentloaded" });
  await page
    .waitForFunction(() => (document.body?.innerText ?? "").length > 300, undefined, { timeout: 60_000 })
    .catch(() => {});
  await page.waitForTimeout(2000);

  // status poll in background
  const poll = setInterval(async () => {
    try {
      const s = await page.evaluate(() => (window as any).__chatStatus ?? "n/a");
      console.log(`[status] ${s} @${new Date().toISOString().slice(11, 19)}`);
    } catch {}
  }, 3000);

  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill("Reply with exactly: pong");
  await page.keyboard.press("Enter");
  console.log("sent");
  await page.waitForTimeout(45_000);
  clearInterval(poll);
  const tail = await page.evaluate(() => document.body?.innerText?.slice(-400) ?? "");
  console.log("body tail:", JSON.stringify(tail));
  await browser.close();
}
main();
