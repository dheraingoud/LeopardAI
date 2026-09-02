// @ts-nocheck — probe: `flow` fence renders FlowGraph in chat; mermaid still renders mermaid.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SHOTS = "C:/Users/HP/leopard-shots/flow-fence";

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1560, height: 1000 } })).newPage();
  const t0 = Date.now();
  const stamp = (l: string) => console.log(`[t+${((Date.now() - t0) / 1000).toFixed(1)}s]`, l);
  page.on("pageerror", (e) => stamp(`[pageerror] ${String(e).slice(0, 200)}`));

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await input.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);

  await input.fill(
    "Reply with exactly two fenced blocks and nothing else: first a ```flow fence with the three lines `master -> researcher`, `master -> writer`, `researcher[done] -> writer[active]`; then a ```mermaid fence with `flowchart LR` and `A --> B`.",
  );
  await input.press("Enter");
  stamp("sent");

  const flow = page.locator('[data-slot="flow-graph"]');
  const got = await flow.first().waitFor({ timeout: 240_000 }).then(() => true).catch(() => false);
  stamp(`flow-graph rendered: ${got}`);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOTS}/both.png`, fullPage: true });
  if (!got) {
    const tail = (await page.locator('[data-slot="message-pair"]').last().innerText().catch(() => "")) ?? "";
    console.log("LAST PAIR:", tail.slice(-800));
    process.exit(1);
  }
  stamp("PASS");
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
