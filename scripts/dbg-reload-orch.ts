// @ts-nocheck — probe: RELOAD mid-orchestration. Approval → Allow → card
// running → reload page → card must reappear via serverStreaming live mirror,
// keep updating, settle ready, follow-up works.
// Shots → C:/Users/HP/leopard-shots/reload-orch/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/reload-orch";

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  const t0 = Date.now();
  const stamp = (l: string) => console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, l);
  page.on("pageerror", (e) => stamp(`[pageerror] ${String(e).slice(0, 300)}`));

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);

  await input.fill(
    "Use spawn_agents: spawn 3 subagents — one researches Next.js caching, one writes a summary, one fact-checks. You must call spawn_agents.",
  );
  await input.press("Enter");
  stamp("sent");

  const card = page.locator('[data-slot="approval-card"]');
  await card.waitFor({ timeout: 300_000 });
  stamp("approval → Allow");
  await card.locator('button:has-text("Allow")').click();

  const runCard = page.locator('[data-slot="agent-run-card"]');
  await runCard.waitFor({ timeout: 120_000 });
  stamp("agent-run-card visible — running 15s then RELOAD");
  await page.waitForTimeout(15_000);
  const chatUrl = page.url();

  await page.reload({ waitUntil: "domcontentloaded" });
  stamp(`reloaded ${chatUrl}`);

  // Card must reappear from the live mirror (serverStreaming) or persisted row
  const cardBack = await runCard.waitFor({ timeout: 120_000 }).then(() => true).catch(() => false);
  stamp(`card reappeared after reload: ${cardBack}`);
  await page.screenshot({ path: `${SHOTS}/1-after-reload.png` });
  if (!cardBack) { console.log("FAIL: run card lost on reload"); process.exit(1); }

  // NOTE: __chatStatus is the CLIENT stream machine — after a reload it reads
  // "ready" immediately while the SERVER finishes the orchestration in the
  // background. The live mirror patches the card when the server row lands.
  // So wait on the CARD leaving "running", not on status.
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-slot="agent-run-card"]');
      return el && !/running/i.test(el.textContent ?? "");
    },
    undefined,
    { timeout: 420_000, polling: 2000 },
  );
  stamp("card settled (server finished, mirror patched)");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/2-settled.png`, fullPage: true });

  const cardText = (await runCard.first().innerText().catch(() => "")) ?? "";
  stamp(`final card: ${cardText.slice(0, 140).replace(/\n/g, " | ")}`);
  if (/running/i.test(cardText)) { console.log("FAIL: card stuck running after settle"); process.exit(1); }

  // Follow-up proves the chat is alive
  const input2 = page.locator('[data-slot="composer-bar"] textarea');
  await input2.fill("Reply with exactly: recovered.");
  await input2.press("Enter");
  // Enter during serverStreaming ENQUEUES (drain fires when the server run
  // finishes). So wait for the TEXT, not status — generous ceiling.
  const gotText = await page
    .waitForFunction(() => /recovered\./i.test(document.body.innerText), undefined, { timeout: 300_000, polling: 2000 })
    .then(() => true)
    .catch(() => false);
  const body = (await page.textContent("body")) ?? "";
  if (!gotText) {
    stamp("FAIL: follow-up missing — dumping tail");
    const bubbles = await page.locator('[data-slot="message-pair"]').allInnerTexts().catch(() => []);
    stamp(`pairs: ${bubbles.length}; last: ${(bubbles[bubbles.length - 1] ?? "").slice(-400).replace(/\n/g, " | ")}`);
    stamp(`status: ${await page.evaluate(() => (window as any).__chatStatus)}`);
    await page.screenshot({ path: `${SHOTS}/3-followup-fail.png`, fullPage: true });
    process.exit(1);
  }
  stamp("follow-up recovered: true");
  await browser.close();
  stamp("reload-orch probe PASS");
}
main().catch((e) => { console.error(e); process.exit(1); });
