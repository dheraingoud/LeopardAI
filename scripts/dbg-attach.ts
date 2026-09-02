// @ts-nocheck
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
async function main() {
  writeFileSync("C:/Users/HP/leopard-shots/probe-note.txt", "probe artifact");
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  p.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
  p.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text().slice(0, 200)); });
  await p.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  await p.locator('[data-slot="composer-bar"] textarea').waitFor({ timeout: 60_000 });
  await p.waitForTimeout(1500);
  await p.locator('button[aria-label="Add attachment"]').click();
  await p.waitForTimeout(400);
  const fi = p.locator('[data-slot="composer-bar"] input[type="file"]').last();
  console.log("fileInputs:", await p.locator('input[type="file"]').count());
  await fi.setInputFiles("C:/Users/HP/leopard-shots/probe-note.txt");
  await p.waitForTimeout(1200);
  console.log("chips:", await p.locator('[data-slot="attachment-chip"]').count());
  const btn = p.locator('[data-slot="attachment-chip"] button').first();
  console.log("btn aria:", await btn.getAttribute("aria-label"));
  // Playwright actionability flakes on the tiny ghost button — DOM click is
  // what matters (verified working in dbg-attach2).
  await p.evaluate(() => (document.querySelector('[data-slot="attachment-chip"] button') as HTMLButtonElement | null)?.click());
  await p.waitForTimeout(800);
  console.log("chips after remove:", await p.locator('[data-slot="attachment-chip"]').count());
  console.log("attachments wrap:", await p.locator('[data-slot="composer-attachments"]').count());
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
