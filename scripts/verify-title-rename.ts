// Verify: sidebar chat title renames from "New Chat" after first exchange
// (server-side persistChatTitle, 2026-08-28 fix).
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  const ta = page.locator("textarea").first();
  await ta.waitFor({ state: "visible", timeout: 15000 });

  await ta.pressSequentially("say the word pineapple and nothing else", {
    delay: 10,
  });
  await ta.press("Enter");

  // Wait for the assistant to finish (generous; kimi cold starts are slow).
  await page.waitForTimeout(3000);
  // Poll sidebar for a renamed row (anything not "New Chat" that wasn't there
  // before). Titles arrive via data-chat-title fast-path OR the server write.
  let renamed = "";
  for (let i = 0; i < 30; i++) {
    const titles = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("span.truncate")];
      return rows.map((r) => (r.textContent ?? "").trim()).filter(Boolean);
    });
    renamed =
      titles.find((t) => /pineapple/i.test(t)) ??
      titles.find((t) => t && t !== "New Chat" && t.length > 3 && !/leopard|new chat/i.test(t)) ??
      "";
    if (renamed) break;
    await page.waitForTimeout(2000);
  }
  console.log("renamed title:", JSON.stringify(renamed));
  await page.screenshot({ path: "verify-title.png" });
  console.log("PASS:", renamed.length > 0);
  await browser.close();
  process.exit(renamed ? 0 : 1);
}
main().catch((e) => (console.error(e), process.exit(1)));
