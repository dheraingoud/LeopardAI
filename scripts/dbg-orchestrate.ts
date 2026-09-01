// @ts-nocheck — probe script, not app code
// Φ-multi-agent e2e: force a spawn_agents call, approve via the AskCard,
// screenshot the live card (running → settled → expanded), then reload and
// verify the settled card persists.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync("C:/Users/HP/leopard-shots/orch", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1560, height: 1000 } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const stamp = (label: string) =>
    console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, label);
  let allowClicked = false;
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error" || (allowClicked && (t === "log" || t === "warn" || t === "info")))
      stamp(`[console.${t}] ${m.text().slice(0, 300)}`);
  });
  page.on("requestfailed", (r) =>
    stamp(`[requestfailed] ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ""}`),
  );
  page.on("request", (r) => {
    if (r.url().includes("/api/chat")) stamp(`[req-start] ${r.method()} ${r.url()}`);
  });
  page.on("response", (r) => {
    if (r.url().includes("/api/chat")) stamp(`[resp] ${r.status()} ${r.url()}`);
  });
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) stamp(`[NAV] ${f.url()}`);
  });
  page.on("pageerror", (e) => stamp(`[pageerror] ${String(e).slice(0, 500)}`));
  page.on("requestfinished", (r) => {
    if (r.url().includes("/api/chat")) stamp(`[req-done] ${r.method()} ${r.url()}`);
  });
  await page.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  stamp("loaded");

  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill(
    "Use a team of subagents for this: research the latest Next.js caching changes, then write a short summary, then have another agent verify it. Use spawn_agents.",
  );
  await page.keyboard.press("Enter");
  stamp("sent");

  // 1. AskCard appears (approval gate) → Allow.
  const card = page.locator('[data-slot="approval-card"]');
  await card.waitFor({ timeout: 120_000 });
  stamp("approval card visible");
  await page.screenshot({ path: "C:/Users/HP/leopard-shots/orch/1-approval.png" });
  const resumeDone = page.waitForResponse(
    (r) => r.url().includes("/api/chat") && r.request().method() === "POST",
    { timeout: 600_000 },
  );
  await card.locator('button:has-text("Allow")').click();
  allowClicked = true;
  stamp("clicked Allow");

  // 2. Live orchestration card while agents run.
  const runCard = page.locator('[data-slot="agent-run-card"]');
  await runCard.waitFor({ timeout: 120_000 });
  stamp("run card visible");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "C:/Users/HP/leopard-shots/orch/2-running.png" });

  // 3. Wait for the turn to settle: the resume POST's SSE closes when the
  // synthesis stream ends. (message-actions matches the USER bubble's edit
  // actions too — a false positive that raced the earlier probe.)
  const resumeResp = await resumeDone;
  await resumeResp.finished();
  stamp("settled (resume POST body finished)");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "C:/Users/HP/leopard-shots/orch/3-settled.png" });

  const liveCount = await page.locator('[data-slot="agent-run-card"]').count();
  console.log("cards live (pre-reload):", liveCount);

  // 4. Expand the card.
  await runCard.locator("button").first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: "C:/Users/HP/leopard-shots/orch/4-expanded.png", fullPage: true });

  // 5. Reload → card persists settled.
  await page.reload({ waitUntil: "domcontentloaded" });
  // Hydration + Convex fetch take seconds; 1.5s sleep counted cards before
  // the transcript rendered (false "0 cards after reload" alarm).
  await page
    .waitForFunction(() => (document.body?.innerText ?? "").length > 500, undefined, { timeout: 120_000 })
    .catch(() => {});
  await page.waitForTimeout(2000);
  const after = await page.locator('[data-slot="agent-run-card"]').count();
  await page.screenshot({ path: "C:/Users/HP/leopard-shots/orch/5-reload.png", fullPage: true });
  console.log("cards after reload:", after);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
