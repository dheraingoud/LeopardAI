// @ts-nocheck — why doesn't chip remove work?
import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  await p.locator('[data-slot="composer-bar"] textarea').waitFor({ timeout: 60_000 });
  await p.locator('button[aria-label="Add attachment"]').click();
  await p.locator('[data-slot="composer-bar"] input[type="file"]').last().setInputFiles("C:/Users/HP/leopard-shots/probe-note.txt");
  await p.waitForTimeout(1500);
  const chips = () => p.locator('[data-slot="attachment-chip"]').count();
  console.log("chips:", await chips());
  // 1. raw DOM click
  await p.evaluate(() => (document.querySelector('[data-slot="attachment-chip"] button') as HTMLButtonElement)?.click());
  await p.waitForTimeout(500);
  console.log("after DOM click:", await chips());
  // 2. add again, try playwright click with console listeners
  await p.locator('button[aria-label="Add attachment"]').click();
  await p.locator('[data-slot="composer-bar"] input[type="file"]').last().setInputFiles("C:/Users/HP/leopard-shots/probe-note.txt");
  await p.waitForTimeout(1200);
  console.log("chips re-added:", await chips());
  p.on("console", (m) => console.log("[pg]", m.type(), m.text().slice(0, 160)));
  p.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
  await p.locator('[data-slot="attachment-chip"] button').first().click({ force: true });
  await p.waitForTimeout(500);
  console.log("after force click:", await chips());
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
