import { chromium } from "playwright";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const c = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  (c as any).setAdminAuth(process.env.CONVEX_DEPLOY_KEY!);
  const chats = (await c.query(api.chats.list as never, { userId: "leopard-dev-test-user-0001" } as never)) as any[];
  const chat = [...chats].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(`http://localhost:3001/chat/${chat._id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);
  const info = await page.evaluate(() => {
    const body = document.body.innerText;
    const codeEl = document.querySelector(".cb-shell code");
    return {
      hasTitle: body.includes("Big Cat Weights"),
      hasBar: !!document.querySelector("[data-slot='bar-chart']"),
      codeSnippet: codeEl ? (codeEl as HTMLElement).innerText.slice(0, 200) : null,
      shells: document.querySelectorAll(".cb-shell").length,
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: "shots/dbg-render.png" });
  await browser.close();
}
void main();
