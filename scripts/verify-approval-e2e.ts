// Verify: webFetch=ask → ApprovalDock appears → Allow → tool executes → answer.
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });

  // Pick nemotron (reliable tool-caller) via the model selector.
  const trigger = page.locator('[data-slot="model-selector-trigger"]').first();
  if (await trigger.count()) {
    await trigger.click();
    const nem = page.locator('[data-slot="model-selector-item"]', { hasText: "Nemotron" }).first();
    if (await nem.count()) await nem.click();
  }
  // Effort Low — keep the thinking short.
  await page.keyboard.press("Escape");

  const ta = page.locator("textarea").first();
  await ta.pressSequentially(
    "Use the webFetch tool to fetch https://example.com and tell me the page title.",
    { delay: 8 },
  );
  await ta.press("Enter");

  // Wait for the approval dock (model thinks ~10-40s).
  const dock = page.locator('[data-slot="approval-card"]');
  try {
    await dock.waitFor({ state: "visible", timeout: 300000 });
    console.log("DOCK: visible");
  } catch {
    console.log("DOCK: MISSING after 300s");
    console.log("PAGE:", (await page.locator("main").innerText()).slice(-400));
    await page.screenshot({ path: "verify-approval-missing.png" });
    await browser.close();
    process.exit(1);
  }

  await page.getByRole("button", { name: "Allow" }).click();
  console.log("ALLOW: clicked");

  // Tool card should appear and complete; then a text answer.
  try {
    await page
      .locator('[data-slot="tool-call"], [data-slot="tool-group"]')
      .first()
      .waitFor({ state: "visible", timeout: 120000 });
    console.log("TOOLCARD: visible");
  } catch {
    console.log("TOOLCARD: missing");
  }

  // Wait for the stream to finish (send button back to Send).
  await page.waitForFunction(
    () => document.querySelector('[data-slot="composer-send"]')?.getAttribute("aria-label") === "Send message",
    { timeout: 180000 },
  );
  const tail = await page.locator("main").innerText();
  console.log("FINAL:", tail.slice(-400));
  await page.screenshot({ path: "verify-approval-done.png" });
  console.log("ERRORS:", errors.length ? errors.slice(0, 3) : "none");
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
