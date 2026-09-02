// @ts-nocheck — probe: live per-agent activity notes update while agents run.
// Samples expanded card text every 4s; PASS if a note like "searching:" or
// "fetching:" appears for a running agent.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/live-notes";

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  const t0 = Date.now();
  const stamp = (l: string) => console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, l);
  page.on("pageerror", (e) => stamp(`[pageerror] ${String(e).slice(0, 200)}`));

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.waitFor({ timeout: 60_000 });
  // History restores async — wait for it to settle before counting cards.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(3000);

  // /chat may restore a previous conversation containing an OLD done run
  // card — count existing cards so we track only the NEW one.
  const priorCards = await page.locator('[data-slot="agent-run-card"]').count();
  const priorPairs = await page.locator('[data-slot="message-pair"]').count();
  stamp(`prior run cards: ${priorCards}, prior pairs: ${priorPairs}, url: ${page.url()}`);

  await input.fill(
    "Use spawn_agents: spawn 2 subagents — one researches the latest Next.js caching docs (use web search + fetch a doc page), one writes a summary. You must call spawn_agents.",
  );
  await input.press("Enter");
  stamp("sent");

  const card = page.locator('[data-slot="approval-card"]');
  await card.waitFor({ timeout: 300_000 });
  stamp("approval → Allow");
  await card.locator('button:has-text("Allow")').click();

  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-slot="agent-run-card"]').length > n,
    priorCards,
    { timeout: 120_000 },
  );
  const runCard = page.locator('[data-slot="agent-run-card"]').nth(priorCards);
  const toggle = runCard.locator("button[aria-expanded]");
  if ((await toggle.getAttribute("aria-expanded").catch(() => null)) !== "true") {
    await toggle.click().catch(() => {});
  }

  const seen = new Set<string>();
  let liveNote = false;
  for (let i = 0; i < 100; i++) {
    const txt = (await runCard.innerText().catch(() => "")) ?? "";
    if (i < 3 || i % 10 === 0) stamp(`sample[${i}]: ${txt.replace(/\n/g, " | ").slice(0, 220)}`);
    for (const line of txt.split("\n")) {
      if (/^(searching|fetching|using |writing)/i.test(line.trim()) && !seen.has(line)) {
        seen.add(line);
        stamp(`note: ${line}`);
        liveNote = true;
      }
    }
    // Don't trust an instantly-"done" card — could be a stale restored one.
    if (i > 5 && /done ·/.test(txt) && !/running/.test(txt)) break;
    if (i === 5) await page.screenshot({ path: `${SHOTS}/mid-run.png` });
    await page.waitForTimeout(4000);
  }
  stamp(`live activity notes seen: ${liveNote}`);
  await page.screenshot({ path: `${SHOTS}/settled.png`, fullPage: true });
  if (!liveNote) { console.log("FAIL: no live tool-activity notes observed"); process.exit(1); }
  stamp("PASS");
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
