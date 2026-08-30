import { chromium } from "playwright";

async function waitCard(page: import("playwright").Page, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("button, [role='button'], div"));
      return els.some((el) => /\bKB\b|\bcreated\b/.test((el as HTMLElement).innerText ?? "") && (el as HTMLElement).innerText.length < 120);
    });
    if (found) return true;
    await page.waitForTimeout(1500);
  }
  return false;
}

async function clickCard(page: import("playwright").Page) {
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("button, [role='button'], div"));
    const card = els.find(
      (el) => /\bKB\b|\bcreated\b/.test((el as HTMLElement).innerText ?? "") && (el as HTMLElement).innerText.length < 120,
    ) as HTMLElement | undefined;
    card?.click();
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill(
    "textarea",
    "Use the createDocument tool to make a short markdown document listing 3 facts about leopards.",
  );
  await page.keyboard.press("Enter");

  // Approval gate may intercept createDocument (TOOL_APPROVAL_RULES) — allow it.
  const allow = page.getByRole("button", { name: /^allow/i });
  try {
    await allow.waitFor({ timeout: 90_000 });
    await allow.first().click();
  } catch {
    /* no gate this run */
  }

  const cardShown = await waitCard(page, 120_000);
  await page.screenshot({ path: "shots/artifact-card.png" });
  let panelLive = false;
  if (cardShown) {
    await clickCard(page);
    await page.waitForTimeout(2500);
    panelLive = await page.evaluate(() => /leopard/i.test(document.body.innerText));
    await page.screenshot({ path: "shots/artifact-panel.png" });
  }
  // Stopped chip must NOT fire on a turn that ended with a tool artifact.
  await page.waitForTimeout(2000);
  const stoppedChip = await page.evaluate(() =>
    /Stopped/i.test(document.body.innerText),
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const cardAfterReload = await waitCard(page, 15_000);
  const stoppedAfterReload = await page.evaluate(() =>
    /Stopped/i.test(document.body.innerText),
  );
  console.log(
    JSON.stringify({ cardShown, panelLive, cardAfterReload, stoppedChip, stoppedAfterReload }),
  );
  await browser.close();
}
void main();
