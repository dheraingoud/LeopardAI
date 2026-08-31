import { chromium } from "playwright";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Reconnect e2e: start a generation, wait until the SERVER row has real text
// (kimi can reason for 60s+ before the first text token — reloading in that
// window leaves nothing to mirror), reload, then assert the UI keeps growing
// from the live mirror until the server completes.
async function main() {
  const c = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  (c as any).setAdminAuth(process.env.CONVEX_DEPLOY_KEY!);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.fill(
    "textarea",
    "Write a long detailed essay (at least 600 words) about the evolution of big cats. Answer directly without using any tools.",
  );
  await page.keyboard.press("Enter");

  const chatId = (await page
    .waitForFunction(() => location.pathname.split("/chat/")[1] ?? null, { timeout: 30_000 })
    .then((h) => h.jsonValue())) as string;

  // Wait for server-side text (max 3 min — 429 storms slow first tokens).
  let serverText = 0;
  const textDeadline = Date.now() + 180_000;
  while (Date.now() < textDeadline && serverText < 200) {
    await page.waitForTimeout(5000);
    const rows = (await c.query(api.messages.list as never, { chatId } as never)) as any[];
    const last = rows[rows.length - 1];
    serverText = (last?.parts ?? [])
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("").length;
  }

  const urlBefore = page.url();
  await page.reload({ waitUntil: "domcontentloaded" });

  // After reload, the mirror should keep filling the bubble from server rows.
  let grew = false;
  let prev = 0;
  const growDeadline = Date.now() + 240_000;
  while (Date.now() < growDeadline) {
    await page.waitForTimeout(8000);
    const len = await page.evaluate(() => document.body.innerText.length);
    const rows = (await c.query(api.messages.list as never, { chatId } as never)) as any[];
    const last = rows[rows.length - 1];
    if (prev > 0 && len > prev + 40) grew = true;
    prev = len;
    if (last?.status === "completed") break;
  }

  const sameChat = page.url() === urlBefore;
  console.log(JSON.stringify({ serverText, sameChat, grew }));
  await page.screenshot({ path: "shots/reconnect.png" });
  await browser.close();
}
void main();
