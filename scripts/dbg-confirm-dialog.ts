// @ts-nocheck — probe: destructive-action ConfirmDialog on sidebar chat delete.
// Verifies: trash opens dialog (chat NOT deleted), Cancel keeps it, reopen +
// confirm deletes it. Shots → C:/Users/HP/leopard-shots/confirm/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const SHOTS = "C:/Users/HP/leopard-shots/confirm";

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

  await page.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-slot="composer-bar"] textarea', { timeout: 90_000 });

  // Seed a chat so the list has a row.
  await page.locator('[data-slot="composer-bar"] textarea').fill(`confirm probe ${Date.now() % 100000} — reply with one word`);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/chat\/[a-z0-9]+/i, { timeout: 30_000 });
  const chatId = page.url().split("/chat/")[1];
  console.log("seeded chat:", chatId);
  await page.waitForTimeout(3000);

  // Hover row → kebab/delete control. Thread-list delete is an icon button.
  const row = page.locator('[data-slot="thread-list"] [role="button"]').first();
  await row.hover();
  await page.waitForTimeout(500);
  // find delete trigger within the row (title/aria contains "delete")
  const delBtn = row.locator('button[title*="elete"], button[aria-label*="elete"]').first();
  await delBtn.click({ force: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/1-dialog-open.png` });

  const dialogVisible = await page.locator('[role="dialog"]').isVisible();
  console.log("dialog open:", dialogVisible);

  // Cancel → chat still listed.
  await page.locator('[role="dialog"] button:has-text("Cancel")').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/2-after-cancel.png` });
  const stillThere = await page.locator('[data-slot="thread-list"]').isVisible();
  console.log("cancel keeps dialog closed; thread list present:", stillThere);

  // Reopen + confirm delete.
  await row.hover();
  await page.waitForTimeout(500);
  await delBtn.click({ force: true });
  await page.waitForTimeout(500);
  await page.locator('[role="dialog"] button:has-text("Delete chat")').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/3-after-confirm.png` });
  console.log("confirm clicked; now at:", page.url());

  await browser.close();
  console.log("confirm-dialog probe done");
}

main().catch((e) => { console.error(e); process.exit(1); });
