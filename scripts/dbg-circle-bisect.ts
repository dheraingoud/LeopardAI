import { chromium } from "playwright";

// Empirical: hide each candidate subtree one at a time, screenshot the disc
// region each time. The file WITHOUT the disc names the culprit.
async function main() {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.waitForTimeout(1500);

  const clip = { x: 380, y: 20, width: 520, height: 420 };
  await p.screenshot({ path: "shots/bisect-00-baseline.png", clip });

  // candidates: every element in main with rect intersecting the disc zone,
  // walking breadth-first but only 2 levels deep
  const candidates: string[] = await p.evaluate(`(() => {
    const zone = { x0: 340, y0: 0, x1: 940, y1: 540 };
    const out = [];
    const main = document.querySelector("main > div.relative.z-10 > div > div > .isolate") || document.querySelector("main");
    const walk = (el, depth, path) => {
      const r = el.getBoundingClientRect();
      const hit = !(r.x > zone.x1 || r.x + r.width < zone.x0 || r.y > zone.y1 || r.y + r.height < zone.y0);
      if (hit && r.width > 60 && r.height > 60) {
        el.setAttribute("data-bisect", String(out.length));
        out.push(path + " <" + el.tagName.toLowerCase() + "> " + (el.className && el.className.toString ? el.className.toString() : "").slice(0, 70) + " [" + Math.round(r.x) + "," + Math.round(r.y) + " " + Math.round(r.width) + "x" + Math.round(r.height) + "]");
      }
      if (depth >= 5) return;
      let i = 0;
      for (const c of el.children) walk(c, depth + 1, path + "/" + (i++));
    };
    let i = 0;
    for (const c of main.children) walk(c, 0, "main/" + (i++));
    return out;
  })()`);

  for (let i = 0; i < candidates.length; i++) {
    await p.evaluate((idx) => {
      const el = document.querySelector(`[data-bisect="${idx}"]`);
      if (el) (el as HTMLElement).style.visibility = "hidden";
    }, i);
    await p.screenshot({ path: `shots/bisect-${String(i + 1).padStart(2, "0")}.png`, clip });
    await p.evaluate((idx) => {
      const el = document.querySelector(`[data-bisect="${idx}"]`);
      if (el) (el as HTMLElement).style.visibility = "";
    }, i);
  }
  console.log(candidates.map((c, i) => `${String(i + 1).padStart(2, "0")}: ${c}`).join("\n"));
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
