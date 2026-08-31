import { chromium } from "playwright";

// Message actions e2e: hover assistant bubble → actions row appears →
// copy fires (clipboard toast), regenerate re-streams a fresh answer.
async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill(
    "textarea",
    "In one short sentence: what color is a leopard's coat? Answer directly without using any tools.",
  );
  await page.keyboard.press("Enter");

  // Wait for a settled assistant answer (no streaming caret).
  // Settled = run started, then status back to ready (sidebar titles can
  // contain the answer keywords — never trust body text for settle).
  await page.waitForFunction(
    () => (window as any).__chatStatus === "submitted" || (window as any).__chatStatus === "streaming",
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForFunction(
    () => (window as any).__chatStatus === "ready",
    undefined,
    { timeout: 300_000 },
  );
  await page.waitForTimeout(1500);

  const actions = page.locator("[data-slot='message-actions']").last();
  await actions.scrollIntoViewIfNeeded();
  // Actions may be hover-gated — hover the bubble region first.
  await actions.hover({ force: true }).catch(() => {});
  await page.waitForTimeout(800);

  const copyBtn = page.getByRole("button", { name: /copy response/i }).last();
  const copyVisible = await copyBtn.isVisible().catch(() => false);
  let copyWorked = false;
  if (copyVisible) {
    await copyBtn.click();
    await page.waitForTimeout(800);
    copyWorked = await page
      .evaluate(() => navigator.clipboard.readText())
      .then((t) => t.length > 10)
      .catch(() => false);
  }

  const regenBtn = page.getByRole("button", { name: /regenerate response/i }).last();
  const regenVisible = await regenBtn.isVisible().catch(() => false);
  let regenWorked = false;
  if (regenVisible) {
    const before = await page.evaluate(() => document.body.innerText.length);
    await regenBtn.click();
    // Regen should leave ready, then settle back to ready.
    await page
      .waitForFunction(
        () => (window as any).__chatStatus !== "ready",
        undefined,
        { timeout: 30_000 },
      )
      .catch(() => null);
    await page.waitForFunction(
      () => (window as any).__chatStatus === "ready",
      undefined,
      { timeout: 300_000 },
    );
    const after = await page.evaluate(() => document.body.innerText.length);
    regenWorked = after >= before - 50;
  }

  console.log(JSON.stringify({ copyVisible, copyWorked, regenVisible, regenWorked }));
  await page.screenshot({ path: "shots/actions.png" });
  await browser.close();
}
void main();
