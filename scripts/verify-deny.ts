import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill(
    "textarea",
    "Use the webFetch tool to fetch https://example.com and tell me its title.",
  );
  await page.keyboard.press("Enter");
  const deny = page.getByRole("button", { name: /^deny/i });
  await deny.waitFor({ timeout: 90_000 });
  await deny.first().click();
  // Resumed run should answer WITHOUT fetching — wait for a text answer.
  await page.waitForTimeout(60_000);
  const bubbles = await page.evaluate(
    () => document.querySelectorAll("[data-role='assistant'], article, .group").length,
  );
  const body = await page.evaluate(() => document.body.innerText);
  const answered = body.length > 600 && !/Allow/i.test(body.slice(-400));
  const cardGone = !(await page.evaluate(() =>
    Array.from(document.querySelectorAll("button")).some((b) =>
      /^(allow|deny)$/i.test((b as HTMLElement).innerText.trim()),
    ),
  ));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  const noStaleCard = !(await page.evaluate(() =>
    Array.from(document.querySelectorAll("button")).some((b) =>
      /^(allow|deny)$/i.test((b as HTMLElement).innerText.trim()),
    ),
  ));
  console.log(JSON.stringify({ answered, cardGone, noStaleCard, bubbles }));
  await page.screenshot({ path: "shots/deny.png" });
  await browser.close();
}
void main();
