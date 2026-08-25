import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  const ta = p.locator("textarea").first();
  await ta.click();
  await ta.fill("Call the webFetch tool with url https://example.com right now. Do not answer from memory, I need the live fetch result.");
  await p.keyboard.press("Enter");
  let cardFound = false;
  try {
    await p.waitForSelector("text=/Allow|Deny/i", { timeout: 75000 });
    cardFound = true;
  } catch {}
  await p.screenshot({ path: "../verify-a1-card.png" });
  let resumed = false;
  if (cardFound) {
    await p.getByRole("button", { name: /allow/i }).first().click();
    try {
      await p.waitForFunction(
        () => /Example Domain/i.test(document.body.innerText),
        { timeout: 90000 },
      );
      resumed = true;
    } catch {}
  }
  await p.waitForTimeout(2500);
  await p.screenshot({ path: "../verify-a2-resumed.png" });
  const states = await p.evaluate(() => document.body.innerText.slice(0, 1500));
  console.log(JSON.stringify({ cardFound, resumed, errors: errors.slice(0, 4) }, null, 2));
  if (!resumed) console.log("BODY:", states.slice(0, 600));
  await b.close();
})();
