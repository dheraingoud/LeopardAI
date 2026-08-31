import { chromium } from "playwright";

async function main() {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.waitForTimeout(1500);
  const out = await p.evaluate(`(() => {
    // reproduce bisect tagging to find candidate #6 (index 5)
    const zone = { x0: 340, y0: 0, x1: 940, y1: 540 };
    const tagged = [];
    const main = document.querySelector("main > div.relative.z-10 > div > div > .isolate") || document.querySelector("main");
    const walk = (el, depth) => {
      const r = el.getBoundingClientRect();
      const hit = !(r.x > zone.x1 || r.x + r.width < zone.x0 || r.y > zone.y1 || r.y + r.height < zone.y0);
      if (hit && r.width > 60 && r.height > 60) tagged.push(el);
      if (depth >= 5) return;
      for (const c of el.children) walk(c, depth + 1);
    };
    for (const c of main.children) walk(c, 0);
    const el = tagged[5];
    if (!el) return { err: "no element", count: tagged.length };
    const dump = (node, pseudo) => {
      const cs = getComputedStyle(node, pseudo || null);
      return {
        content: pseudo ? cs.content : undefined,
        bg: cs.backgroundColor,
        bgImg: cs.backgroundImage.slice(0, 300),
        shadow: cs.boxShadow.slice(0, 200),
        filter: cs.filter,
        mask: cs.maskImage !== "none" ? cs.maskImage.slice(0, 120) : "",
        webkitMask: cs.webkitMaskImage !== "none" ? cs.webkitMaskImage.slice(0, 120) : "",
        br: cs.borderRadius,
        pos: cs.position,
        opacity: cs.opacity,
      };
    };
    return {
      cls: (el.className || "").toString(),
      rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
      self: dump(el),
      before: dump(el, "::before"),
      after: dump(el, "::after"),
    };
  })()`);
  console.log(JSON.stringify(out, null, 1));
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
