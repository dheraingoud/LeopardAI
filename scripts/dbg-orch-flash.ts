// @ts-nocheck — probe: orchestration with DeepSeek V4 Flash as master model.
// Watches status transitions, card states, and whether composer freezes.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync("C:/Users/HP/leopard-shots/orch-flash", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1560, height: 1000 } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const stamp = (l: string) => console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, l);
  page.on("pageerror", (e) => stamp(`[pageerror] ${String(e).slice(0, 400)}`));
  page.on("request", (r) => { if (r.url().includes("/api/chat")) stamp(`[req] ${r.method()} ${r.url()}`); });
  page.on("response", (r) => { if (r.url().includes("/api/chat")) stamp(`[resp] ${r.status()} ${r.url()}`); });
  page.on("requestfailed", (r) => stamp(`[reqfail] ${r.url()} ${r.failure()?.errorText ?? ""}`));
  page.on("console", (m) => {
    if (m.type() === "error") stamp(`[console.error] ${m.text().slice(0, 300)}`);
  });

  await page.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.waitFor({ timeout: 60_000 });
  stamp("loaded");

  // Select DeepSeek V4 Flash via the model selector.
  await page.locator('[data-slot="model-selector-trigger"]').click();
  await page.waitForTimeout(600);
  await page.locator('[data-slot="model-selector-item"]', { hasText: "DeepSeek V4 Flash" }).first().click();
  await page.waitForTimeout(500);
  const sel = await page.locator('[data-slot="model-selector-trigger"]').innerText();
  stamp(`model selected: ${sel.trim()}`);

  await input.click();
  await input.fill(
    "Use a team of subagents for this: research the latest Next.js caching changes, then write a short summary, then have another agent verify it. Use spawn_agents.",
  );
  await input.press("Enter");
  stamp("sent");

  // Watch status every 2s; screenshot on card; cap 8 min.
  let lastStatus = "";
  let sawCard = false;
  let approved = false;
  let runStarted = false;
  const deadline = Date.now() + 480_000;
  while (Date.now() < deadline) {
    const status = await page.evaluate(() => (window as any).__chatStatus ?? "?").catch(() => "?");
    if (status !== lastStatus) { stamp(`status: ${status}`); lastStatus = status; }
    const approval = page.locator('[data-slot="approval-card"]');
    if (!approved && (await approval.count()) > 0) {
      stamp("approval card → Allow");
      await page.screenshot({ path: "C:/Users/HP/leopard-shots/orch-flash/1-approval.png" });
      await approval.locator('button:has-text("Allow")').click();
      approved = true;
    }
    const runCard = page.locator('[data-slot="agent-run-card"]');
    if ((await runCard.count()) > 0 && !sawCard) {
      sawCard = true;
      stamp("agent-run-card visible");
      await page.screenshot({ path: "C:/Users/HP/leopard-shots/orch-flash/2-card.png" });
    }
    if (sawCard) {
      // sample agent statuses in the card
      const txt = await runCard.first().innerText().catch(() => "");
      const queued = (txt.match(/queued/g) ?? []).length;
      if (queued > 0 && Date.now() - t0 > 90_000 && !stamp._q) {
        stamp._q = 1;
        stamp(`still queued x${queued} after 90s: ${txt.slice(0, 200).replace(/\n/g, " | ")}`);
        await page.screenshot({ path: "C:/Users/HP/leopard-shots/orch-flash/3-stuck.png" });
      }
    }
    if (status === "submitted" || status === "streaming") runStarted = true;
    if (runStarted && (status === "ready" || status === "error")) break;
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: "C:/Users/HP/leopard-shots/orch-flash/4-final.png" });
  const stopped = await page.locator('[data-slot="stopped-run"]').count();
  const cards = await page.locator('[data-slot="agent-run-card"]').count();
  const sendDisabled = await page.locator('[data-slot="composer-send"]').isDisabled().catch(() => null);
  stamp(`final: status=${lastStatus} stoppedNotes=${stopped} cards=${cards} sendDisabled=${sendDisabled}`);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
