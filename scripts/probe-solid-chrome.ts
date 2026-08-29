import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs: string[] = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  // + menu
  await p.click('button[title="Add attachment"]');
  await p.waitForTimeout(600);
  const plusOpen = await p.locator("text=attach image").isVisible().catch(() => false);
  await p.screenshot({ path: "verify-plus-solid.png" });
  await p.keyboard.press("Escape");
  // model selector
  await p.click('button:has-text("kimi"), button:has-text("Kimi")').catch(() => {});
  await p.waitForTimeout(600);
  const modelOpen = await p.locator('[role="menu"], [role="listbox"]').first().isVisible().catch(() => false);
  await p.screenshot({ path: "verify-model-solid.png" });
  console.log("plus menu:", plusOpen, "| model popover:", modelOpen, "| errors:", errs);
  await b.close();
  process.exit(plusOpen ? 0 : 1);
})();
