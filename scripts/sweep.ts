import { chromium } from "playwright";
import { mkdirSync } from "fs";

// Full visual sweep: empty, chat w/ messages, sidebar, cmd+K, settings,
// share page, light mode, mobile. Screenshots → ../sweep/*.png
const OUT = "../sweep";
mkdirSync(OUT, { recursive: true });

async function shot(page: any, name: string) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot", name);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1365, height: 768 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem("theme", "dark"); } catch {}
    document.documentElement.classList.add("dark");
    document.documentElement.classList.remove("light");
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });

  // 1. Empty state (dark)
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await shot(page, "01-empty-dark");

  // 2. Send a message, wait for a response, capture transcript
  await page.click('[data-slot="model-selector-trigger"]');
  await page.fill('[data-slot="model-selector-search"]', "nemotron");
  await page.waitForTimeout(600);
  await page.click('[data-slot="model-selector-item"]');
  await page.fill('[data-slot="composer-bar"] textarea', "Explain what a hash map is in two sentences.");
  await page.click('[data-slot="composer-send"]');
  await page.waitForTimeout(3000);
  await shot(page, "02-streaming");
  // wait for the run to settle
  const t0 = Date.now();
  while (Date.now() - t0 < 240_000) {
    const busy = await page.locator('[data-slot="composer-send"][aria-label="Stop generating"]').count();
    if (!busy) break;
    await page.waitForTimeout(3000);
  }
  await shot(page, "03-answered");
  const chatUrl = page.url();

  // 3. Message hover actions
  await page.locator('[data-slot="message-pair"]').last().hover().catch(() => {});
  await shot(page, "04-hover-actions");

  // 4. Cmd+K palette
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(700);
  await shot(page, "05-command-palette");
  await page.keyboard.press("Escape");

  // 5. Sidebar (visible already) — collapse/expand if a toggle exists
  const sidebarToggle = page.locator('[data-slot="sidebar-toggle"], button[aria-label*="Sidebar" i]').first();
  if (await sidebarToggle.count()) {
    await sidebarToggle.click();
    await shot(page, "06-sidebar-collapsed");
    await sidebarToggle.click();
  }

  // 7. Settings
  await page.goto("http://localhost:3001/settings", { waitUntil: "networkidle" }).catch(() => {});
  await shot(page, "07-settings");

  // 8. Share page — create share link from the chat
  await page.goto(chatUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const shareBtn = page.locator('button[aria-label*="Share" i], [data-slot*="share" i]').first();
  if (await shareBtn.count()) {
    await shareBtn.click();
    await page.waitForTimeout(1500);
    const link = await page.evaluate(async () => {
      try { return await navigator.clipboard.readText(); } catch { return ""; }
    });
    if (link.includes("/share/")) {
      await page.goto(link, { waitUntil: "networkidle" });
      await shot(page, "08-shared");
    } else {
      console.log("share link not in clipboard:", link.slice(0, 80));
      await shot(page, "08-share-clicked");
    }
  }

  // 9. Light mode (toggle via html class if next-themes)
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
    try { localStorage.setItem("theme", "light"); } catch {}
  });
  await page.reload({ waitUntil: "networkidle" });
  await shot(page, "09-empty-light");

  // 10. Mobile viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "10-mobile-empty");
  await page.goto(chatUrl, { waitUntil: "networkidle" }).catch(() => {});
  await shot(page, "11-mobile-chat");

  console.log("JS-ERRORS:", errors.length ? errors.slice(0, 8) : "none");
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
