import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1560, height: 1000 } });
  await p.goto("http://localhost:3001/chat/j571gx22gh39xr5yc1y1s6b4p98dh0n3", { waitUntil: "networkidle" });
  await p.waitForTimeout(3000);
  // elementFromPoint right in the middle of the black box (~780, 340)
  const out = await p.evaluate(() => {
    const stack = document.elementsFromPoint(780, 340);
    return stack.slice(0, 8).map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        slot: el.getAttribute("data-slot"),
        cls: (el.className || "").toString().slice(0, 110),
        bg: cs.backgroundColor,
        bgImg: cs.backgroundImage === "none" ? "" : cs.backgroundImage.slice(0, 90),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      };
    });
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
