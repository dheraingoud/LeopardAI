/* Per-chat reasoning effort — BADGE-level proof: create two fresh chats via
 * Convex, seed chat-scoped localStorage keys, reload each chat, read the
 * effort chip on the reasoning control. A must show HIGH, B must show LOW
 * (cross-chat leak = fail). */
import { chromium } from "playwright";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const USER = "leopard-dev-test-user-0001";

async function main() {
  const c = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  (c as any).setAdminAuth(process.env.CONVEX_DEPLOY_KEY!);
  const idA = (await c.mutation(api.chats.create as never, {
    userId: USER,
    title: "Effort Probe A",
    model: "moonshotai/kimi-k3",
  } as never)) as string;
  const idB = (await c.mutation(api.chats.create as never, {
    userId: USER,
    title: "Effort Probe B",
    model: "moonshotai/kimi-k3",
  } as never)) as string;

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

  const badgeOn = async (chatId: string) => {
    await p.goto(`http://localhost:3001/chat/${chatId}`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(4000);
    return p.evaluate(() => {
      const labels = ["off", "on", "low", "medium", "high", "max"];
      return [...document.querySelectorAll("span, div, button")]
        .filter((el) => {
          const t = (el.textContent ?? "").trim().toLowerCase();
          return labels.includes(t) && el.children.length === 0 && t.length <= 6;
        })
        .map((el) => (el.textContent ?? "").trim().toLowerCase());
    });
  };

  await p.goto("http://localhost:3001/chat", { waitUntil: "domcontentloaded" });
  await p.evaluate(([a, bId]) => {
    localStorage.setItem(`leopard:reasoning:${a}:moonshotai/kimi-k3`, "high");
    localStorage.setItem(`leopard:reasoning:${bId}:moonshotai/kimi-k3`, "low");
    localStorage.setItem("leopard:reasoning:moonshotai/kimi-k3", "medium"); // model default — must NOT win
  }, [idA, idB]);

  const aChips = await badgeOn(idA);
  const bChips = await badgeOn(idB);
  const aHigh = aChips.includes("high");
  const bLow = bChips.includes("low");
  console.log(
    JSON.stringify({
      aChips,
      bChips,
      aHigh,
      bLow,
      pass: aHigh && bLow && !aChips.includes("low") && !bChips.includes("high"),
    }),
  );
  await b.close();
}
void main();
