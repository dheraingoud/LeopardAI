// @ts-nocheck — probe script
// Φ skills + MCP visual sweep:
//   1. "+" popover → Skills + MCP servers items visible
//   2. Skill modal: add skill with canary body, row appears
//   3. Slash menu: "/" lists /probe-canary, selecting inserts token
//   4. End-to-end invocation: send /probe-canary → model replies with canary
//   5. MCP panel: opens, add http server via manual form, row + status dot,
//      toggle off/on, survives reload
// Screenshots → C:/Users/HP/leopard-shots/skills-mcp/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/skills-mcp";
const CANARY = "ZEBRA-OK-7734";

async function waitReady(page, timeout = 420_000) {
  await page
    .waitForFunction(() => window.__chatStatus === "ready", undefined, { timeout })
    .catch(() => console.log("[warn] status never returned ready"));
}

async function openPlusMenu(page) {
  await page.locator('button[aria-label="Add attachment"]').click();
  await page.waitForTimeout(500);
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
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 300));
  });

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-slot="composer-bar"] textarea', { timeout: 60_000 });
  await waitReady(page, 120_000);
  await page.waitForTimeout(1000);

  // ── 1. "+" popover ─────────────────────────────────────────────
  await openPlusMenu(page);
  const popText = await page.evaluate(() => document.body.innerText);
  console.log("popover has Skills:", popText.includes("Skills"));
  console.log("popover has MCP servers:", popText.includes("MCP servers"));
  await page.screenshot({ path: `${SHOTS}/01-plus-popover.png` });

  // ── 2. Skill modal: add skill ──────────────────────────────────
  await page.locator("button", { hasText: "Skills" }).first().click();
  await page.waitForSelector('div[role="dialog"][aria-label="Skills"]', { timeout: 10_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/02-skills-modal-empty.png` });

  await page.getByText("add skill", { exact: false }).click();
  await page.waitForTimeout(500);
  await page.locator('div[role="dialog"] input[placeholder="skill name"]').fill("probe-canary");
  await page
    .locator('div[role="dialog"] textarea')
    .first()
    .fill(`When this skill is invoked, reply with exactly the token ${CANARY} and nothing else.`);
  await page.screenshot({ path: `${SHOTS}/03-skill-form-filled.png` });
  await page.getByText("Add skill", { exact: true }).click();
  await page.waitForTimeout(700);
  const skillListed = await page.evaluate(() => document.body.innerText.includes("probe-canary"));
  console.log("skill row listed:", skillListed);
  await page.screenshot({ path: `${SHOTS}/04-skill-listed.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);

  // ── 3. Slash menu ──────────────────────────────────────────────
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.click();
  await input.fill("/");
  await page.waitForTimeout(700);
  const slashVisible = await page.locator('[data-slot="slash-menu"]').isVisible().catch(() => false);
  console.log("slash menu visible on '/':", slashVisible);
  if (slashVisible) {
    await page.screenshot({ path: `${SHOTS}/05-slash-menu.png` });
    await page.locator('[data-slot="slash-menu"] button', { hasText: "probe-canary" }).click();
    await page.waitForTimeout(400);
    const val = await input.inputValue();
    console.log("composer after select:", JSON.stringify(val));
  }

  // ── 4. End-to-end invocation ───────────────────────────────────
  await input.fill(`/probe-canary`);
  await page.screenshot({ path: `${SHOTS}/06-slash-token.png` });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/07-invoke-streaming.png` });
  await waitReady(page);
  await page.waitForTimeout(1200);
  const body = await page.evaluate(() => document.body?.innerText ?? "");
  const invoked = body.includes(CANARY);
  console.log("skill invoked end-to-end (canary in reply):", invoked);
  await page.screenshot({ path: `${SHOTS}/08-invoke-settled.png`, fullPage: true });

  // ── 5. MCP panel ───────────────────────────────────────────────
  await openPlusMenu(page);
  await page.getByText("MCP servers", { exact: true }).click();
  const dlg = page.locator('div[role="dialog"][aria-label="MCP servers"]');
  await dlg.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/09-mcp-panel-empty.png` });

  await dlg.getByText("add server", { exact: false }).click();
  await page.waitForTimeout(500);
  await dlg.locator('input[placeholder="server name"]').fill("probe-http");
  await dlg.locator('input[placeholder="https://host.example/mcp"]').fill("http://localhost:9999/mcp");
  await page.screenshot({ path: `${SHOTS}/10-mcp-form-filled.png` });
  await dlg.getByText("Add server", { exact: true }).click();
  await page.waitForTimeout(700);
  const mcpListed = await page.evaluate(() => document.body.innerText.includes("probe-http"));
  console.log("mcp server listed:", mcpListed);
  await page.screenshot({ path: `${SHOTS}/11-mcp-listed.png` });

  // Expand row → toggle off
  await page.getByText("probe-http", { exact: true }).click().catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/12-mcp-expanded.png` });

  // Reload persistence
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-slot="composer-bar"] textarea', { timeout: 60_000 });
  await waitReady(page, 120_000);
  await page.waitForTimeout(800);
  await openPlusMenu(page);
  await page.getByText("MCP servers", { exact: true }).click();
  await page
    .locator('div[role="dialog"][aria-label="MCP servers"]')
    .waitFor({ timeout: 10_000 });
  await page.waitForTimeout(500);
  const mcpPersisted = await page.evaluate(() => document.body.innerText.includes("probe-http"));
  console.log("mcp server persisted after reload:", mcpPersisted);
  await page.screenshot({ path: `${SHOTS}/13-mcp-persisted.png` });

  await browser.close();
  console.log("skills-mcp probe done");
  if (!skillListed || !slashVisible || !invoked || !mcpListed || !mcpPersisted) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
