import { chromium } from "playwright";

async function main() {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.waitForTimeout(1500);
  const out = await p.evaluate(`(() => {
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
    if (!el) return { err: "none" };
    const rows = [];
    const dumpAll = (node, depth) => {
      const r = node.getBoundingClientRect();
      const cs = getComputedStyle(node);
      rows.push({
        d: depth,
        tag: node.tagName,
        cls: (node.className || "").toString().slice(0, 80),
        slot: node.getAttribute("data-slot"),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        bg: cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : "",
        bgImg: cs.backgroundImage !== "none" ? cs.backgroundImage.slice(0, 140) : "",
        shadow: cs.boxShadow !== "none" ? cs.boxShadow.slice(0, 100) : "",
      });
      for (const c of node.children) dumpAll(c, depth + 1);
    };
    dumpAll(el, 0);
    return rows;
  })()`);
  console.log(JSON.stringify(out, null, 1));
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
