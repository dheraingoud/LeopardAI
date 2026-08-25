/* Deferred-create E2E: /chat must NOT mint a row until first send. */
import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

  const countRows = () =>
    page.locator('a[href^="/chat/"], [data-chat-id]').count();

  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  const urlAtDraft = page.url();
  const rowsBefore = await page.evaluate(() => document.body.innerText.includes("New Chat"));
  await page.screenshot({ path: "../verify-draft-1.png" });

  // composer must exist on the draft
  const ta = page.locator("textarea").first();
  const hasComposer = await ta.count();
  await ta.click();
  await ta.fill("Reply with exactly: draft-create works");
  await page.keyboard.press("Enter");

  await page.waitForTimeout(6000);
  const urlAfterSend = page.url();
  await page.waitForTimeout(12000);
  await page.screenshot({ path: "../verify-draft-2.png" });
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));

  console.log(
    JSON.stringify(
      {
        urlAtDraft,
        hasComposer,
        newChatRowAtDraft: rowsBefore,
        urlAfterSend,
        routed: /\/chat\/[a-z0-9]+/i.test(urlAfterSend) && !urlAfterSend.endsWith("/chat"),
        answerVisible: bodyText.includes("draft-create works"),
        errors: errors.slice(0, 5),
      },
      null,
      2,
    ),
  );
  await browser.close();
})();
