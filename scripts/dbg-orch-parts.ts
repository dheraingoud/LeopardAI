// @ts-nocheck — probe: dump persisted parts of the latest assistant message
// in the most recent orch chat (reload persistence diagnosis).
import { chromium } from "playwright";

async function main() {
  const chatId = process.argv[2];
  if (!chatId) throw new Error("pass chatId");
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto(`http://localhost:3001/chat/${chatId}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => (document.body?.innerText ?? "").length > 500,
    undefined,
    { timeout: 120_000 },
  ).catch(() => {});
  await page.waitForTimeout(3000);
  const dump = await page.evaluate(async () => {
    // messages live in React state; grab via the DOM is lossy — instead read
    // the Convex-backed query cache isn't exposed. Fallback: report rendered
    // structure + any window hooks.
    const cards = document.querySelectorAll('[data-slot="agent-run-card"]').length;
    const tools = [...document.querySelectorAll("[data-slot]")].map((e) => e.getAttribute("data-slot"));
    return { cards, slots: tools.slice(0, 60), bodyLen: document.body.innerText.length };
  });
  console.log(JSON.stringify(dump, null, 2));
  await browser.close();
}
main();
