// @ts-nocheck — probe: edit a sent user message, pick a different model in the
// slim picker, Save&resend → generation re-triggers on the NEW model.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/edit-model";

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  const t0 = Date.now();
  const stamp = (l: string) => console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, l);
  page.on("pageerror", (e) => stamp(`[pageerror] ${String(e).slice(0, 200)}`));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" || /chat\]/i.test(t)) stamp(`[console.${m.type()}] ${t.slice(0, 300)}`);
  });
  page.on("response", (r) => {
    if (r.url().includes("/api/chat")) stamp(`[POST /api/chat] → ${r.status()}`);
  });
  page.on("requestfailed", (r) => {
    if (r.url().includes("/api/chat")) stamp(`[reqfail] ${r.failure()?.errorText}`);
  });

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);

  await input.fill("Reply with exactly: alpha one");
  await input.press("Enter");
  await page.waitForFunction(() => (window as any).__chatStatus === "ready", undefined, { timeout: 180_000 });
  stamp("first reply done");

  // Hover the user bubble to reveal Edit; click it.
  const pair = page.locator('[data-slot="message-pair"]').last();
  await pair.hover();
  const editBtn = pair.locator('button[aria-label*="dit"], button:has-text("Edit")').first();
  await editBtn.click();
  const editor = page.locator('[data-slot="edit-message"]');
  await editor.waitFor({ timeout: 15_000 });
  stamp("edit open");

  // Slim model picker present?
  const select = editor.locator("select");
  const hasSelect = await select.isVisible().catch(() => false);
  stamp(`model picker visible: ${hasSelect}`);
  if (hasSelect) {
    const options = await select.locator("option").allInnerTexts();
    stamp(`options: ${options.join(" | ")}`);
    const values = await select.locator("option").evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
    const current = await select.inputValue();
    // deepseek hangs right now, kimi dead, gemma needs gateway key — lightning is live.
    const other = values.find((v) => /nemotron-3-5-lightning/i.test(v) && v !== current) ?? values.find((v) => v !== current);
    if (other) {
      await select.selectOption(other);
      stamp(`switched model → ${other}`);
    }
  }

  await editor.locator("textarea").fill("Reply with exactly: beta two");
  await editor.locator('button:has-text("Save & resend")').click();
  stamp("saved — expecting resend");
  await page.waitForFunction(() => (window as any).__chatStatus !== "ready", undefined, { timeout: 30_000 })
    .then(() => stamp("GENERATION RE-TRIGGERED"))
    .catch(() => { stamp("FAIL: resend never started"); process.exit(1); });
  const settled = await page
    .waitForFunction(() => (window as any).__chatStatus === "ready", undefined, { timeout: 180_000 })
    .then(() => true)
    .catch(() => false);
  if (!settled) {
    stamp(`HANG: status=${await page.evaluate(() => (window as any).__chatStatus)}`);
    await page.screenshot({ path: `${SHOTS}/hang.png`, fullPage: true });
    process.exit(1);
  }
  await page.waitForTimeout(2500); // let error toasts / late text render
  const body = (await page.textContent("body")) ?? "";
  const pairs = await page.locator('[data-slot="message-pair"]').allInnerTexts().catch(() => []);
  const pairText = pairs.join("\n");
  stamp(`pairs: ${pairs.length}; last tail: ${(pairs[pairs.length - 1] ?? "").slice(-300).replace(/\n/g, " | ")}`);
  // Scope to message pairs — the chat TITLE keeps the original prompt's words
  // (title-gen), so a body-wide alpha check false-positives.
  const ok = /beta two/i.test(pairText) && !/alpha one/i.test(pairText);
  stamp(`edited text answered, old reply gone: ${ok}`);
  await page.screenshot({ path: `${SHOTS}/after.png`, fullPage: true });
  if (!ok) process.exit(1);
  stamp("PASS");
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
