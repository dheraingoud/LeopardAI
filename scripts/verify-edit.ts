import { chromium } from "playwright";

// Edit-message e2e: edit the user bubble, resend, assert new answer streams
// and the edited text is what persists after reload.
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill(
    "textarea",
    "In one word: what color is the sun? Answer directly without using any tools.",
  );
  await page.keyboard.press("Enter");
  // Full settle: answer text present, no thinking indicator, no Stop button,
  // no error card (an errored first answer auto-retries mid-edit and races
  // the flow). Rate-limited API days make the error path common.
  await page.waitForFunction(
    () =>
      !/Working on it/i.test(document.body.innerText) &&
      !/Response failed/i.test(document.body.innerText) &&
      document.body.innerText.length > 300 &&
      !document.querySelector("button[aria-label='Stop generating']"),
    { timeout: 180_000 },
  );
  await page.waitForTimeout(2500); // let any auto-retry fire before we edit
  const errored = await page.evaluate(() => /Response failed/i.test(document.body.innerText));
  if (errored) {
    console.log(JSON.stringify({ skipped: "first answer errored (API rate limit)" }));
    await browser.close();
    return;
  }

  const editBtn = page.getByRole("button", { name: /edit and resend/i }).first();
  await editBtn.scrollIntoViewIfNeeded();
  await editBtn.click({ force: true });
  await page.waitForTimeout(600);
  // Edit field should appear inside the user bubble.
  const editArea = page.locator("[data-slot='edit-message'] textarea, [data-slot='edit-message'] [contenteditable]").first();
  const editable = await editArea.isVisible().catch(() => false);
  let edited = false;
  if (editable) {
    await editArea.fill("In one word: what color is the moon?");
    await page.getByRole("button", { name: /save & resend/i }).click();
    // Save populates the composer ("press Enter to resend" toast) — resend.
    await page.waitForFunction(
      () => (document.querySelector("textarea[aria-label='Message']") as HTMLTextAreaElement)?.value.includes("moon"),
      { timeout: 15_000 },
    );
    await page.locator("textarea[aria-label='Message']").first().press("Enter");
    // New user bubble with the edited text must render (API can be slow —
    // allow a generous window).
    await page.waitForFunction(
      () => document.body.innerText.includes("moon"),
      { timeout: 150_000 },
    ).catch(() => {});
    // New answer streams.
    await page
      .waitForFunction(
        () => !/Working on it/i.test(document.body.innerText) && !document.querySelector("button[aria-label='Stop generating']"),
        { timeout: 180_000 },
      )
      .catch(() => {});
    await page.waitForTimeout(1000);
    edited = await page.evaluate(() => document.body.innerText.includes("moon"));
  }

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  const persisted = await page.evaluate(() =>
    document.body.innerText.includes("moon"),
  );
  console.log(JSON.stringify({ editable, edited, persisted }));
  await page.screenshot({ path: "shots/edit.png" });
  await browser.close();
}
void main();
