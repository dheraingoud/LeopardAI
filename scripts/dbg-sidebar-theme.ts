import { chromium } from "playwright";

// Why is the sidebar panel white while the main area is dark on a fresh load?
// String-form evaluate: esbuild's __name injection breaks nested fns under tsx.
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-slot="composer-bar"]');
  await page.waitForTimeout(2000);
  const info = await page.evaluate(`(() => {
    const pick = (x, y) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const chain = [];
      let cur = el;
      while (cur && chain.length < 6) {
        const cs = getComputedStyle(cur);
        chain.push({
          tag: cur.tagName,
          slot: cur.getAttribute("data-slot"),
          cls: (cur.className || "").toString().slice(0, 90),
          bg: cs.backgroundColor,
        });
        cur = cur.parentElement;
      }
      return chain;
    };
    return {
      htmlClass: document.documentElement.className,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      at_rail: pick(25, 400),
      at_panel: pick(150, 250),
      at_main: pick(700, 300),
    };
  })()`);
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
