import { chromium } from "playwright";

// Find what paints the big dark disc in the empty state: pseudo-elements are
// invisible to querySelectorAll, so walk empty-state ancestors and read
// ::before/::after backgrounds. Also dump ALL elements' pseudo backgrounds
// that are dark.
async function main() {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.waitForTimeout(1500);
  const out = await p.evaluate(`(() => {
    const hits = [];
    const scan = (el, pseudo) => {
      const cs = getComputedStyle(el, pseudo);
      if (cs.content === "none" || cs.content === "normal") return;
      const bg = cs.backgroundColor, img = cs.backgroundImage;
      if (bg === "rgba(0, 0, 0, 0)" && img === "none") return;
      const r = el.getBoundingClientRect();
      hits.push({
        pseudo,
        tag: el.tagName,
        slot: el.getAttribute("data-slot"),
        cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 110),
        bg, img: img === "none" ? "" : img.slice(0, 100),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        pr: { w: cs.width, h: cs.height },
      });
    };
    for (const el of document.querySelectorAll("main *")) {
      scan(el, "::before");
      scan(el, "::after");
    }
    // also: box-shadow can paint a huge soft disc from a small element
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.boxShadow === "none") continue;
      const r = el.getBoundingClientRect();
      const nums = cs.boxShadow.match(/-?\d+(\.\d+)?px/g)?.map((n) => parseFloat(n)) ?? [];
      const maxBlur = Math.max(0, ...nums);
      if (maxBlur < 60) continue;
      hits.push({
        pseudo: "box-shadow",
        tag: el.tagName,
        slot: el.getAttribute("data-slot"),
        cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 110),
        bg: cs.backgroundColor,
        img: cs.boxShadow.slice(0, 140),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        pr: { w: "", h: "" },
      });
    }
    return hits.slice(0, 30);
  })()`);
  console.log(JSON.stringify(out, null, 1));
  await p.screenshot({ path: "shots/dbg-circle.png" });
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
