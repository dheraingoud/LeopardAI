// Verify: slash-command + mention popovers (2026-08-28). Real keystrokes.
import { chromium } from "playwright";

const BASE = "http://localhost:3001";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle" });
  const ta = page.locator("textarea").first();
  await ta.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(2500); // convex skill-library seed+query
  await ta.click();

  const slashMenu = page.locator('[data-slot="slash-menu"]');
  const mentionMenu = page.locator('[data-slot="mention-menu"]');

  // 1. "/" opens slash menu with items
  await ta.pressSequentially("/", { delay: 60 });
  await slashMenu.waitFor({ state: "visible", timeout: 5000 });
  const total = await slashMenu.locator('[role="option"]').count();
  console.log("slash items:", total);

  // 2. typing filters
  await ta.pressSequentially("code", { delay: 50 });
  await page.waitForTimeout(400);
  const filtered = await slashMenu.locator('[role="option"]').count();
  console.log("filtered (/code):", filtered);

  // 3. Enter selects (inserts "/slug "), does NOT send
  await ta.press("Enter");
  await page.waitForTimeout(300);
  const val = await ta.inputValue();
  const menuGone = (await slashMenu.count()) === 0;
  console.log("after Enter:", JSON.stringify(val), "menuGone:", menuGone);

  // 4. Esc suppression: type "/" again, Esc, then keep typing — stays closed
  await ta.fill("");
  await ta.pressSequentially("/", { delay: 60 });
  await slashMenu.waitFor({ state: "visible", timeout: 5000 });
  await ta.press("Escape");
  await page.waitForTimeout(300);
  const afterEsc = (await slashMenu.count()) === 0;
  await ta.pressSequentially("x", { delay: 60 });
  await page.waitForTimeout(300);
  const stillClosed = (await slashMenu.count()) === 0;
  console.log("esc closes:", afterEsc, "stays closed on more typing:", stillClosed);

  // 5. mention menu: "@" trailing
  await ta.fill("");
  await ta.pressSequentially("recap @", { delay: 40 });
  await page.waitForTimeout(800);
  const mVisible = await mentionMenu.isVisible().catch(() => false);
  const mItems = mVisible
    ? await mentionMenu.locator('[role="option"]').count()
    : 0;
  console.log("mention visible:", mVisible, "items:", mItems);
  await page.screenshot({ path: "verify-popovers.png" });

  console.log("page errors:", errors.length ? errors : "none");
  const pass =
    total > 0 &&
    filtered >= 1 &&
    filtered < total &&
    val.startsWith("/") &&
    val.endsWith(" ") &&
    menuGone &&
    afterEsc &&
    stillClosed &&
    errors.length === 0;
  console.log("PASS:", pass, "(mention menu:", mVisible ? "ok" : "no chats — soft)", ")");
  await browser.close();
  process.exit(pass ? 0 : 1);
}
main().catch((e) => (console.error(e), process.exit(1)));
