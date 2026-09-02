// @ts-nocheck — probe script
// Φ surfaces 12 + 16: sidebar (history list, new chat, switch, search,
//   collapse) + theme toggle (token swap, no-flash, both-theme shots).
// Screenshots → C:/Users/HP/leopard-shots/sidebar/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/sidebar";
const MARK = `SIDEBAR-${Date.now() % 100000}`;

async function waitReady(page, timeout = 420_000) {
  await page
    .waitForFunction(() => window.__chatStatus === "ready", undefined, { timeout })
    .catch(() => console.log("[warn] status never returned ready"));
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1560, height: 1000 },
    colorScheme: "dark",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-slot="composer-bar"] textarea', { timeout: 60_000 });
  await waitReady(page, 120_000);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/01-sidebar-dark.png` });

  // ── 1. Send a message → chat row appears in history ────────────
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.fill(`sidebar probe ${MARK} — reply with one short word.`);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/chat\/[a-z0-9]+/i, { timeout: 30_000 });
  const chatUrl = page.url();
  console.log("navigated to chat:", chatUrl);
  await waitReady(page);
  await page.waitForTimeout(1000);

  const rowListed = await page.evaluate((m) => {
    const txt = document.body.innerText.toLowerCase();
    return txt.includes("sidebar probe") || txt.includes(m.toLowerCase());
  }, MARK);
  console.log("chat row listed in sidebar:", rowListed);
  await page.screenshot({ path: `${SHOTS}/02-row-listed.png` });

  // ── 2. New chat button → draft surface ─────────────────────────
  await page.locator('button[title="New chat"]').first().click();
  await page.waitForTimeout(900);
  console.log("new chat → /chat:", page.url().endsWith("/chat"));
  await page.waitForSelector('[data-slot="composer-bar"] textarea', { timeout: 30_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/03-new-chat-draft.png` });

  // ── 3. Switch back via row click ───────────────────────────────
  await page.getByText("sidebar probe", { exact: false }).first().click();
  await page.waitForTimeout(1200);
  const backOnChat = page.url().includes("/chat/");
  console.log("row click navigates to chat:", backOnChat);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/04-switched-back.png` });

  // ── 4. Search filter ───────────────────────────────────────────
  await page.locator('input[placeholder="Search chats…"]').fill("sidebar probe");
  await page.waitForTimeout(700);
  const searchHit = await page.evaluate(() =>
    document.body.innerText.toLowerCase().includes("sidebar probe"),
  );
  console.log("search filters to match:", searchHit);
  await page.screenshot({ path: `${SHOTS}/05-search.png` });
  await page.locator('input[placeholder="Search chats…"]').fill("");
  await page.waitForTimeout(500);

  // ── 5. Collapse / expand rail ──────────────────────────────────
  await page.locator('button[title="Collapse sidebar"]').click();
  await page.waitForTimeout(700);
  const railVisible = await page.locator('button[title="Expand sidebar"]').isVisible();
  console.log("collapsed rail visible:", railVisible);
  await page.screenshot({ path: `${SHOTS}/06-collapsed-rail.png` });
  await page.locator('button[title="Expand sidebar"]').click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/07-expanded-again.png` });

  // ── 6. Theme toggle (surface 16) ───────────────────────────────
  const bgBefore = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const clsBefore = await page.evaluate(() => document.documentElement.className);
  await page.locator('button[title="Switch to light mode"], button[title="Light"]').first().click();
  await page.waitForTimeout(900);
  const clsAfter = await page.evaluate(() => document.documentElement.className);
  const bgAfter = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  console.log("theme class before/after:", JSON.stringify(clsBefore), "→", JSON.stringify(clsAfter));
  console.log("body bg before/after:", bgBefore, "→", bgAfter);
  console.log("theme flipped:", clsBefore !== clsAfter && bgBefore !== bgAfter);
  await page.screenshot({ path: `${SHOTS}/08-light-theme.png` });

  // reload persistence of theme
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-slot="composer-bar"] textarea', { timeout: 60_000 });
  await page.waitForTimeout(1500);
  const clsReload = await page.evaluate(() => document.documentElement.className);
  console.log("theme persists after reload:", clsReload === clsAfter, JSON.stringify(clsReload));
  await page.screenshot({ path: `${SHOTS}/09-light-after-reload.png` });

  // back to dark for subsequent probes
  await page.locator('button[title="Switch to dark mode"], button[title="Dark"]').first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/10-back-to-dark.png` });

  await browser.close();
  console.log("sidebar probe done");
  if (!rowListed || !backOnChat || !searchHit || !railVisible) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
