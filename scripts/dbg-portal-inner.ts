import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.waitForTimeout(1500);
  const out = await p.evaluate(`(() => {
    const host = document.querySelector("nextjs-portal");
    if (!host || !host.shadowRoot) return null;
    const items = [];
    const walk = (root, depth, path) => {
      let i = 0;
      for (const el of root.children) {
        const r = el.getBoundingClientRect();
        if (r.width >= 20 && r.height >= 20) {
          const cs = getComputedStyle(el);
          items.push({
            path: path + "/" + i,
            tag: el.tagName,
            cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 70),
            rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
            bg: cs.backgroundColor,
            filter: cs.filter,
            shadow: cs.boxShadow.slice(0, 100),
            text: (el.childElementCount === 0 ? (el.textContent || "") : "").slice(0, 40),
          });
        }
        walk(el, depth + 1, path + "/" + i);
        i++;
      }
    };
    walk(host.shadowRoot, 0, "sr");
    return items.slice(0, 40);
  })()`);
  console.log(JSON.stringify(out, null, 1));
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
