import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.waitForTimeout(1500);
  const out = await p.evaluate(`(() => {
    const host = document.querySelector("nextjs-portal");
    const hits = [];
    const scan = (el, pseudo) => {
      const cs = getComputedStyle(el, pseudo);
      if (cs.content === "none" || cs.content === "normal") return;
      const w = parseFloat(cs.width) || 0, h = parseFloat(cs.height) || 0;
      if (w < 100 && h < 100) return;
      hits.push({
        pseudo, tag: el.tagName,
        cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 90),
        w: cs.width, h: cs.height,
        pos: cs.position + " " + cs.top + " " + cs.left,
        bg: cs.backgroundColor,
        img: cs.backgroundImage === "none" ? "" : cs.backgroundImage.slice(0, 120),
        br: cs.borderRadius,
        anim: cs.animationName,
      });
    };
    const walk = (root, depth) => {
      for (const el of root.querySelectorAll("*")) {
        scan(el, "::before");
        scan(el, "::after");
        if (depth < 10 && el.shadowRoot) walk(el.shadowRoot, depth + 1);
      }
    };
    walk(host.shadowRoot, 0);
    return hits;
  })()`);
  console.log(JSON.stringify(out, null, 1));
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
