// @ts-nocheck — probe script
// Φ surface 8 (edit & resend):
//  1. send turn 1 ("alpha" marker answer)
//  2. click Edit on the user bubble → EditMessage card appears
//     (textarea + discard warning + Cancel/Save)
//  3. Esc cancels — bubble text unchanged, no new request
//  4. edit again, change text, Ctrl+Enter saves → auto-resend fires
//     (POST /api/chat), old reply discarded, new reply streams + settles
// Screenshots → C:/Users/HP/leopard-shots/edit/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/edit";

async function waitReady(page, timeout = 420_000) {
  await page
    .waitForFunction(() => window.__chatStatus === "ready", undefined, { timeout })
    .catch(() => console.log("[warn] status never returned ready"));
}

async function send(page, text) {
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await page.waitForSelector('[data-slot="composer-bar"] textarea', { timeout: 60_000 });
  await input.click();
  await input.fill(text);
  await page.keyboard.press("Enter");
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let posts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/chat")) posts++;
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200));
  });

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  await send(page, 'Reply with exactly: alpha-one');
  await waitReady(page);
  await page.waitForTimeout(1000);
  console.log("turn1 settled, posts:", posts);

  // 2. Edit → card appears
  await page.locator('[aria-label="Edit and resend"]').first().click();
  await page.waitForSelector('[data-slot="edit-message"]', { timeout: 10_000 });
  await page.screenshot({ path: `${SHOTS}/01-editing.png` });
  const card = await page.evaluate(() => {
    const el = document.querySelector('[data-slot="edit-message"]');
    const ta = el?.querySelector("textarea");
    const body = el?.textContent ?? "";
    return {
      hasTextarea: !!ta,
      prefilled: (ta?.value ?? "").includes("alpha-one"),
      showsDiscardWarn: /discard/i.test(body),
      hasCancelSave: /Cancel/.test(body) && /Save/.test(body),
    };
  });
  console.log("edit card:", JSON.stringify(card));

  // 3. Esc cancels — no resend
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  const afterEsc = await page.evaluate(() => ({
    cardGone: !document.querySelector('[data-slot="edit-message"]'),
    bubbleKept: (document.body?.innerText ?? "").includes("alpha-one"),
  }));
  console.log("after Esc:", JSON.stringify(afterEsc), "posts still:", posts);

  // 4. Edit again, change text, Ctrl+Enter → auto-resend
  await page.locator('[aria-label="Edit and resend"]').first().click();
  await page.waitForSelector('[data-slot="edit-message"] textarea', { timeout: 10_000 });
  await page.locator('[data-slot="edit-message"] textarea').fill("Reply with exactly: bravo-two");
  await page.screenshot({ path: `${SHOTS}/02-edited.png` });
  await page.keyboard.press("Control+Enter");
  console.log("saved via Ctrl+Enter — waiting for resend");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOTS}/03-resend-streaming.png` });
  await waitReady(page);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/04-resend-settled.png`, fullPage: true });

  const final = await page.evaluate(() => {
    // Scope to the message thread: the SIDEBAR keeps the chat title (derived
    // from turn 1), which false-positives the old prompt text.
    const pairs = Array.from(document.querySelectorAll('[data-slot="message-pair"]'));
    const threadText = pairs.map((p) => p.textContent ?? "").join("\n");
    return {
      url: location.href,
      status: window.__chatStatus,
      pairCount: pairs.length,
      newPromptShown: threadText.includes("bravo-two"),
      oldPromptGone: !threadText.includes("alpha-one"),
      editCardGone: !document.querySelector('[data-slot="edit-message"]'),
    };
  });
  console.log("final:", JSON.stringify(final, null, 2), "posts total:", posts);
  await browser.close();
  console.log("edit-resend probe done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
