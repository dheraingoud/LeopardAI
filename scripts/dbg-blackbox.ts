import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1560, height: 1000 } });
  await p.goto("http://localhost:3001/chat/j571gx22gh39xr5yc1y1s6b4p98dh0n3", { waitUntil: "networkidle" });
  await p.waitForTimeout(3000);
  const out = await p.evaluate(() => {
    const hits: any[] = [];
    for (const el of document.querySelectorAll("main *")) {
      const r = el.getBoundingClientRect();
      if (r.width < 200 || r.height < 100) continue;
      const cs = getComputedStyle(el);
      const m = cs.backgroundColor.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
      if (m.length >= 3 && m[0] < 60 && m[1] < 60 && m[2] < 60 && (m[3] ?? 1) > 0.5) {
        hits.push({
          tag: el.tagName, slot: el.getAttribute("data-slot"),
          cls: (el.className || "").toString().slice(0, 100),
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          bg: cs.backgroundColor,
        });
      }
    }
    return hits.slice(0, 10);
  });
  console.log(JSON.stringify(out, null, 1));
  await p.screenshot({ path: "shots/dbg-blackbox.png" });
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
