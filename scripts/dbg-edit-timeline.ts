// @ts-nocheck — probe: edit & resend timeline. Polls every 500ms after save,
// logging status + which texts are visible, to catch the mirror race.
import { chromium } from "playwright";

const BASE = "http://localhost:3001";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" || t.includes("editAndResend"))
      console.log("[console." + m.type() + "]", t.slice(0, 250));
  });
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/chat")) {
      const body = r.postData() ?? "";
      let summary = "";
      try {
        const j = JSON.parse(body);
        summary = ` chatId=${j.chatId ?? j.id ?? "?"} msgs=${(j.messages ?? []).length} lastRole=${j.messages?.at(-1)?.role} lastText=${JSON.stringify(j.messages?.at(-1)?.parts ?? j.messages?.at(-1)?.content ?? "").slice(0, 120)}`;
      } catch {
        summary = ` raw=${body.slice(0, 200)}`;
      }
      console.log("[req]", r.url().split("/api/")[1] + summary);
    }
  });
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) console.log("[NAV]", f.url());
  });

  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  const input = page.locator('[data-slot="composer-bar"] textarea');
  await page.waitForSelector('[data-slot="composer-bar"] textarea', { timeout: 60_000 });
  await input.click();
  await input.fill("Reply with exactly: alpha-one");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__chatStatus === "ready", undefined, { timeout: 420_000 });
  console.log("turn1 ready");

  await page.locator('[aria-label="Edit and resend"]').first().click();
  await page.waitForSelector('[data-slot="edit-message"] textarea', { timeout: 10_000 });
  await page.locator('[data-slot="edit-message"] textarea').fill("Reply with exactly: bravo-two");
  await page.keyboard.press("Control+Enter");
  console.log("saved — polling 60s");

  for (let i = 0; i < 120; i++) {
    const s = await page.evaluate(() => {
      const body = document.body?.innerText ?? "";
      return {
        st: window.__chatStatus,
        alpha: body.includes("alpha-one"),
        bravo: body.includes("bravo-two"),
        bubbles: document.querySelectorAll('[data-slot="message-pair"]').length,
      };
    });
    console.log(
      `[t+${(i * 0.5).toFixed(1)}s] st=${s.st} alpha=${s.alpha} bravo=${s.bravo} pairs=${s.bubbles}`,
    );
    if (s.st === "ready" && s.bravo && !s.alpha) {
      console.log("CONVERGED");
      break;
    }
    await page.waitForTimeout(500);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
