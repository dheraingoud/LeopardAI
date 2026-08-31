import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill("textarea", "fetch https://example.com and tell me its title");
  await page.keyboard.press("Enter");

  // Wait for the approval card (AskCard) to appear — approval-requested part.
  const allow = page.getByRole("button", { name: /allow/i });
  try {
    await allow.waitFor({ timeout: 90_000 });
  } catch {
    console.log(JSON.stringify({ ok: false, stage: "no-askcard" }));
    await page.screenshot({ path: "shots/approval-none.png" });
    await browser.close();
    return;
  }
  await page.screenshot({ path: "shots/approval-ask.png" });
  await allow.first().click();

  // After Allow, the run must resume and produce assistant text.
  await page.waitForTimeout(3000);
  const resumed = await page.evaluate(() => {
    const els = document.querySelectorAll("[data-slot='message-content'], .prose, article, [class*='message']");
    return Array.from(els).map((e) => (e as HTMLElement).innerText).join("\n");
  });
  // Wait for the resumed run to actually settle before judging/reloading —
  // slow backends (429-storm era) can take minutes.
  await page
    .waitForFunction(() => (window as any).__chatStatus === "ready", undefined, { timeout: 300_000 })
    .catch(() => {});
  await page.waitForTimeout(2000);
  const finalText = await page.evaluate(() => document.body.innerText);
  const bubbleCount = await page.evaluate(
    () => document.querySelectorAll('[data-slot="message-pair"]').length,
  );
  const ok =
    /example domain|example\.com/i.test(finalText) &&
    !/approval-requested/i.test(finalText);
  await page.screenshot({ path: "shots/approval-done.png" });
  // Reload → persisted transcript must show the answer and NO live approval card.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const afterReload = await page.evaluate(() => document.body.innerText);
  const staleCard = /^(allow|deny)$/im.test(afterReload) || /awaiting approval/i.test(afterReload);
  await page.screenshot({ path: "shots/approval-reload.png" });
  console.log(
    JSON.stringify({
      ok,
      bubbles: bubbleCount,
      stoppedChip: /\bStopped\b/.test(finalText),
      answerAfterReload: /example domain/i.test(afterReload),
      staleCardAfterReload: staleCard,
    }),
  );
  await browser.close();
}
void main();
