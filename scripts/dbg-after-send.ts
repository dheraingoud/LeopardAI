import { chromium } from "playwright";

// After send: is the main area dark while sidebar is light?
async function main() {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.fill('[data-slot="composer-bar"] textarea', "hi");
  await p.click('[data-slot="composer-send"]');
  await p.waitForTimeout(4000);
  const info = await p.evaluate(`(() => {
    const pick=(x,y)=>{const el=document.elementFromPoint(x,y);if(!el)return null;const chain=[];let cur=el;while(cur&&chain.length<5){const cs=getComputedStyle(cur);chain.push({tag:cur.tagName,slot:cur.getAttribute('data-slot'),cls:(cur.className||'').toString().slice(0,80),bg:cs.backgroundColor});cur=cur.parentElement;}return chain;};
    return {
      htmlClass: document.documentElement.className.replace(/[a-z0-9_]+__variable/g,'').trim(),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      darkBig: (() => {
        const out = [];
        for (const el of document.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width < 80 || r.height < 80) continue;
          if (r.x > 940 || r.x + r.width < 340 || r.y > 540 || r.y + r.height < 140) continue;
          const cs = getComputedStyle(el);
          const br = parseFloat(cs.borderTopLeftRadius) || 0;
          const tag = el.tagName.toLowerCase();
          const interesting =
            tag === "svg" || tag === "canvas" || tag === "img" || tag === "video" ||
            br >= r.width / 2 - 4 ||
            cs.backgroundImage !== "none";
          if (!interesting) continue;
          out.push({
            tag: el.tagName,
            slot: el.getAttribute("data-slot"),
            cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 130),
            bg: cs.backgroundColor,
            bgImg: cs.backgroundImage.slice(0, 90),
            br: Math.round(br),
            pe: cs.pointerEvents,
            rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          });
        }
        return out.slice(0, 20);
      })(),
      circleStack: (() => {
        const stack = document.elementsFromPoint(640, 330);
        return stack.slice(0, 10).map((el) => {
          const cs = getComputedStyle(el);
          return {
            tag: el.tagName,
            slot: el.getAttribute("data-slot"),
            cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 110),
            bg: cs.backgroundColor,
            bgImg: cs.backgroundImage === "none" ? "" : cs.backgroundImage.slice(0, 80),
            pe: cs.pointerEvents,
          };
        });
      })(),
      blackBox: pick(650, 400),
      main: pick(700,300),
      low: pick(700,600),
      url: location.pathname,
    };
  })()`);
  console.log(JSON.stringify(info, null, 1));
  await p.screenshot({ path: "shots/dbg-after-send.png" });
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
