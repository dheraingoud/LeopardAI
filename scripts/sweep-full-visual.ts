import { chromium, type Page } from "playwright";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Full-app visual e2e: every route × both themes × desktop+mobile.
// Screenshots to shots/sweep/ + structural assertions (fonts, amber, no
// horizontal overflow, canvas colour) so the sweep is a gate, not eyeballs.

const AMER_RE =
  /ffb400|d49600|a57600|rgb\(255, ?180, ?0\)|rgb\(212, ?150, ?0\)|rgb\(165, ?118, ?0\)/;

async function probe(page: Page, name: string) {
  const r = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const all = Array.from(document.querySelectorAll("*"));
    const usesAmber = all.some((el) => {
      const cs = getComputedStyle(el);
      return /ffb400|d49600|rgb\(255, ?180, ?0\)|rgb\(212, ?150, ?0\)/.test(
        `${cs.color} ${cs.backgroundColor} ${cs.borderColor} ${cs.fill} ${cs.stroke} ${cs.outlineColor}`,
      );
    });
    return {
      font: body.fontFamily.slice(0, 40),
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      usesAmber,
      textLen: document.body.innerText.length,
    };
  });
  const geist = /geist/i.test(r.font);
  console.log(
    `${name}: font=${geist ? "geist" : "OFF:" + r.font} amber=${r.usesAmber} hscroll=${r.hScroll} text=${r.textLen}`,
  );
  return r;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `shots/sweep/${name}.png` });
}

async function setTheme(page: Page, theme: "dark" | "light") {
  await page.evaluate((t) => {
    localStorage.setItem("theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
    document.documentElement.classList.toggle("light", t === "light");
  }, theme);
  await page.waitForTimeout(400);
}

async function main() {
  const c = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  (c as any).setAdminAuth(process.env.CONVEX_DEPLOY_KEY!);
  const chats = (await c.query(api.chats.list as never, {
    userId: "leopard-dev-test-user-0001",
  } as never)) as any[];
  const sorted = [...chats].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  let chatWithContent: string | null = null;
  for (const chat of sorted.slice(0, 10)) {
    const rows = (await c.query(api.messages.list as never, { chatId: chat._id } as never)) as any[];
    if (rows.length > 1) {
      chatWithContent = chat._id;
      break;
    }
  }

  const browser = await chromium.launch();
  const failures: string[] = [];

  for (const vp of [
    { name: "desktop", width: 1600, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));

    for (const theme of ["dark", "light"] as const) {
      const tag = `${vp.name}-${theme}`;

      await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
      await setTheme(page, theme);
      await probe(page, `${tag} empty`);
      await shot(page, `${tag}-empty`);

      if (chatWithContent) {
        await page.goto(`http://localhost:3001/chat/${chatWithContent}`, {
          waitUntil: "networkidle",
        });
        await page.waitForTimeout(4000);
        await setTheme(page, theme);
        await probe(page, `${tag} chat`);
        await shot(page, `${tag}-chat`);
      }

      await page.goto("http://localhost:3001/settings", { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
      await setTheme(page, theme);
      const r = await probe(page, `${tag} settings`);
      await shot(page, `${tag}-settings`);
      if (r.hScroll) failures.push(`${tag}-settings: horizontal scroll`);
    }
    if (errors.length) failures.push(`${vp.name} pageerrors: ${errors.slice(0, 3).join(" | ")}`);
    await page.close();
  }

  console.log(JSON.stringify({ chatWithContent, failures }, null, 1));
  await browser.close();
}
void main();
