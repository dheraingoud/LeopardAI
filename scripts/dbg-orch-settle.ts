// @ts-nocheck — watch an existing chat until its run settles; report final state.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const CHAT = process.argv[2];
async function main() {
  mkdirSync("C:/Users/HP/leopard-shots/orch-flash", { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  const t0 = Date.now();
  const stamp = (l: string) => console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, l);
  page.on("pageerror", (e) => stamp(`[pageerror] ${String(e).slice(0, 300)}`));
  await page.goto(`http://localhost:3001/chat/${CHAT}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-slot="composer-bar"] textarea', { timeout: 90_000 });
  stamp("loaded");
  let last = "";
  const deadline = Date.now() + 480_000;
  while (Date.now() < deadline) {
    const status = await page.evaluate(() => (window as any).__chatStatus ?? "?").catch(() => "?");
    if (status !== last) { stamp(`status: ${status}`); last = status; }
    if (status === "ready" || status === "error") break;
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(1500);
  const stopped = await page.locator('[data-slot="stopped-run"]').count();
  const cards = await page.locator('[data-slot="agent-run-card"]').count();
  const cardText = (await page.locator('[data-slot="agent-run-card"]').first().innerText().catch(() => "")).slice(0, 400);
  await page.screenshot({ path: "C:/Users/HP/leopard-shots/orch-flash/5-settled.png" });
  stamp(`final: status=${last} stopped=${stopped} cards=${cards}`);
  console.log("CARD:", cardText.replace(/\n/g, " | "));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
