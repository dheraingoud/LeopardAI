// @ts-nocheck — probe script
// Φ surface 14: composer extras + message actions.
//   send disabled when empty, @mention menu, attachment chip add/remove,
//   quote-reply pill on selection, copy flip, thumbs up/down + feedback
//   dialog, regenerate menu.
// Screenshots → C:/Users/HP/leopard-shots/composer-extras/
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/composer-extras";
const results = {};

async function waitReady(page, timeout = 420_000) {
  await page
    .waitForFunction(() => window.__chatStatus === "ready", undefined, { timeout })
    .catch(() => console.log("[warn] status never returned ready"));
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  writeFileSync("C:/Users/HP/leopard-shots/probe-note.txt", "probe artifact");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1560, height: 1000 },
    colorScheme: "dark",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.waitFor({ timeout: 60_000 });
  await waitReady(page, 120_000);
  await page.waitForTimeout(800);

  // ── 1. send disabled empty → enabled with text ─────────────────
  const send = page.locator('[data-slot="composer-send"]');
  results.sendDisabledEmpty = await send.isDisabled().catch(() => null);
  await input.fill("hello");
  await page.waitForTimeout(400);
  results.sendEnabledWithText = await send.isEnabled().catch(() => false);
  console.log("send disabled empty / enabled typed:", results.sendDisabledEmpty, "/", results.sendEnabledWithText);
  await shot(page, "01-send-states");

  // ── 2. @mention menu ───────────────────────────────────────────
  await input.fill("@");
  await page.waitForTimeout(800);
  results.mentionVisible = await page.locator('[data-slot="mention-menu"]').isVisible().catch(() => false);
  console.log("mention menu visible:", results.mentionVisible);
  if (results.mentionVisible) {
    await shot(page, "02-mention-menu");
    const firstItem = page.locator('[data-slot="mention-menu"] button').first();
    await firstItem.click().catch(() => {});
    await page.waitForTimeout(400);
    const val = await input.inputValue();
    results.mentionInserted = val.startsWith("@") && val.trim().length > 1;
    console.log("mention inserted:", JSON.stringify(val));
  }

  // ── 3. attachment chip add/remove ──────────────────────────────
  await input.fill("");
  await page.locator('button[aria-label="Add attachment"]').click();
  await page.waitForTimeout(500);
  await shot(page, "03-plus-menu");
  // hidden file input on the composer
  const fileInput = page.locator('[data-slot="composer-bar"] input[type="file"]').last();
  results.fileInputExists = (await fileInput.count()) > 0;
  if (results.fileInputExists) {
    await fileInput.setInputFiles("C:/Users/HP/leopard-shots/probe-note.txt");
    await page.waitForTimeout(900);
    results.attachmentChip = await page.locator('[data-slot="composer-attachments"]').isVisible().catch(() => false);
    console.log("attachment chip visible:", results.attachmentChip);
    await shot(page, "04-attachment-chip");
    if (results.attachmentChip) {
      const removeBtn = page.locator('[data-slot="composer-attachments"] button').first();
      await removeBtn.click().catch(() => {});
      await page.waitForTimeout(500);
      results.attachmentRemoved = !(await page.locator('[data-slot="composer-attachments"]').isVisible().catch(() => false));
      console.log("attachment removed:", results.attachmentRemoved);
    }
  } else {
    console.log("[warn] no file input found in composer");
    await page.keyboard.press("Escape");
  }

  // ── 4. send a prompt for message-level actions ─────────────────
  await input.fill("quote probe — reply with exactly: zebra apple melon kiwi");
  await page.keyboard.press("Enter");
  await waitReady(page);
  await page.waitForTimeout(1200);
  await shot(page, "05-settled");

  // ── 5. quote-reply pill on selection ───────────────────────────
  const assistantText = page.locator('[data-slot="message-content"], .cb-markdown, main p').last();
  const box = await assistantText.boundingBox().catch(() => null);
  if (box) {
    await page.mouse.move(box.x + 5, box.y + 8);
    await page.mouse.down();
    await page.mouse.move(box.x + Math.min(box.width - 10, 220), box.y + 8, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    results.quotePill = await page.getByText("Quote", { exact: true }).first().isVisible().catch(() => false);
    console.log("quote pill visible:", results.quotePill);
    await shot(page, "06-quote-pill");
    if (results.quotePill) {
      await page.getByText("Quote", { exact: true }).first().click();
      await page.waitForTimeout(500);
      const composerVal = await input.inputValue();
      results.quoteInserted = composerVal.trim().length > 0;
      console.log("quote inserted into composer:", results.quoteInserted, JSON.stringify(composerVal.slice(0, 60)));
      await shot(page, "07-quote-inserted");
      await input.fill("");
    }
  } else {
    results.quotePill = false;
    console.log("[warn] no assistant text box found for selection");
  }

  // ── 6. message actions: copy / thumbs / regenerate ─────────────
  const actions = page.locator('[data-slot="message-actions"]').last();
  await actions.scrollIntoViewIfNeeded().catch(() => {});
  await actions.hover().catch(() => {});
  await page.waitForTimeout(500);

  const copyBtn = actions.locator('button[aria-label="Copy response"]').first();
  results.copyExists = (await copyBtn.count()) > 0;
  if (results.copyExists) {
    await copyBtn.click();
    await page.waitForTimeout(400);
    results.copyFlips = (await actions.locator('button[aria-label="Copied response"]').count()) > 0;
    console.log("copy flips to Copied:", results.copyFlips);
    await shot(page, "08-copied");
  }

  const upBtn = actions.locator('button[aria-label="Mark response helpful"]');
  results.thumbUpExists = (await upBtn.count()) > 0;
  if (results.thumbUpExists) {
    await upBtn.first().click();
    await page.waitForTimeout(400);
    results.thumbUpActive = (await upBtn.first().getAttribute("aria-pressed")) === "true";
    console.log("thumb up active:", results.thumbUpActive);
    await shot(page, "09-thumb-up");
  }

  const downBtn = actions.locator('button[aria-label="Mark response unhelpful"]');
  results.thumbDownExists = (await downBtn.count()) > 0;
  if (results.thumbDownExists) {
    await downBtn.first().click();
    await page.waitForTimeout(700);
    results.feedbackDialog = await page.locator('div[role="dialog"]').first().isVisible().catch(() => false);
    console.log("feedback dialog opens:", results.feedbackDialog);
    await shot(page, "10-feedback-dialog");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }

  const regenBtn = actions.locator('button[aria-label="Regenerate response"]');
  results.regenExists = (await regenBtn.count()) > 0;
  if (results.regenExists) {
    await regenBtn.first().click();
    await page.waitForTimeout(500);
    await shot(page, "11-regen-opened");
    results.regenMenu = await page.locator('[role="menu"], [role="listbox"], [data-slot*="regenerate"]').first().isVisible().catch(() => false);
    console.log("regenerate affordance present:", results.regenExists, "menu opens:", results.regenMenu);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }

  await browser.close();
  console.log("composer-extras probe done");
  console.log("RESULTS " + JSON.stringify(results));
  const fail = Object.entries(results).filter(([, v]) => v === false).map(([k]) => k);
  if (fail.length) {
    console.log("FAILED: " + fail.join(", "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
