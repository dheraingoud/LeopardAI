import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.waitForTimeout(1200);
  const out = await p.evaluate(`(() => {
    const hosts = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) {
          const r = el.getBoundingClientRect();
          hosts.push({
            tag: el.tagName,
            id: el.id || "",
            cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 80),
            rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
            inner: el.shadowRoot.innerHTML.slice(0, 300),
          });
          walk(el.shadowRoot);
        }
      }
    };
    walk(document);
    return hosts;
  })()`);
  console.log(JSON.stringify(out, null, 1));
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
