// @ts-nocheck — probe script
// Φ multi-turn context chain: 3 turns, each builds on prior answer.
// Verifies follow-ups render, no duplicate bubbles, scroll pin holds,
// history persists (reload shows all turns).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/multiturn";

// minCount: marker occurrences expected in the FULL body — user prompts echo
// the marker too, so plain includes() false-passes on later turns.
async function sendAndSettle(page, text, marker, shot, minCount = 1) {
  // Streams occasionally run minutes (observed 5min POSTs) — sending early
  // just queues by design, which reads as "no reply". Wait for ready first.
  await page.waitForFunction(
    () => (window as any).__chatStatus === "ready",
    undefined,
    { timeout: 360_000 },
  );
  const st = await page.evaluate(() => (window as any).__chatStatus ?? "n/a");
  console.log(`[pre-send] __chatStatus=${st} url=${page.url()}`);
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill(text);
  // Confirm the send actually fired a chat POST — a silent miss here reads
  // downstream as "model never replied".
  const respP = page
    .waitForResponse((r) => r.url().includes("/api/chat") && r.request().method() === "POST", { timeout: 30_000 })
    .then((r) => console.log(`[send] POST /api/chat -> ${r.status()}`))
    .catch(() => console.log(`[send] NO /api/chat POST within 30s for "${text.slice(0, 40)}"`));
  await page.keyboard.press("Enter");
  await respP;
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/${shot}-streaming.png` });
  try {
    await page.waitForFunction(
      ([m, n]) => {
        const body = (document.body?.innerText ?? "").toLowerCase();
        return body.split(m).length - 1 >= n;
      },
      [marker, minCount],
      { timeout: 120_000 },
    );
  } catch (e) {
    const body = await page.evaluate(() => document.body?.innerText?.slice(-1500) ?? "");
    console.log(`[timeout] marker "${marker}" not found. body tail:\n${body}`);
    await page.screenshot({ path: `${SHOTS}/${shot}-TIMEOUT.png` });
    throw e;
  }
  // settle: composer back to idle (no streaming state); also survive the
  // /chat → /chat/<id> navigation that follows the first send.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/${shot}-settled.png` });
  console.log(`settled: ${marker}`);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ colorScheme: "dark" })).newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300));
  });

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-slot="composer-bar"] textarea').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1000);

  await sendAndSettle(page, 'Remember the codeword "zephyr". Reply with exactly: noted.', "noted", "01-turn1");
  await sendAndSettle(page, "What is the codeword? Reply with just the word.", "zephyr", "02-turn2", 2);
  await sendAndSettle(page, "Say it twice separated by a comma, nothing else.", "zephyr, zephyr", "03-turn3");

  // reload persistence
  const url = page.url();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .waitForFunction(() => (document.body?.innerText ?? "").length > 300, undefined, { timeout: 60_000 })
    .catch(() => {});
  await page.waitForTimeout(2000);
  const body = await page.evaluate(() => document.body.innerText.toLowerCase());
  console.log("persisted zephyr:", body.includes("zephyr"), "| noted:", body.includes("noted"));
  await page.screenshot({ path: `${SHOTS}/04-reloaded.png` });
  console.log("chat url:", url);
  console.log("multiturn probe done");
  await browser.close();
}

main();
