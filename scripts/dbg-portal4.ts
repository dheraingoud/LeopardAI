import { chromium } from "playwright";

async function main() {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.waitForTimeout(1500);
  const body = `(function () {
    const host = document.querySelector("nextjs-portal");
    const res = { hostPseudo: null, hits: [], styleCount: 0 };
    if (!host || !host.shadowRoot) return res;
    for (const ps of ["::before", "::after"]) {
      const cs = getComputedStyle(host, ps);
      if (cs.content !== "none" && cs.content !== "normal") {
        res.hostPseudo = { ps: ps, w: cs.width, h: cs.height, bg: cs.backgroundColor, img: cs.backgroundImage.slice(0, 120), pos: cs.position };
      }
    }
    const styles = host.shadowRoot.querySelectorAll("style");
    res.styleCount = styles.length;
    let all = "";
    for (const s of styles) { all += s.textContent + " "; }
    const rules = all.split("}");
    for (const r of rules) {
      if (/radial-gradient|circle/i.test(r) && /#0|#1|black|23, 23|12, 12/i.test(r)) {
        res.hits.push(r.slice(0, 300));
      }
    }
    res.hits = res.hits.slice(0, 10);
    return res;
  })()`;
  const out = await p.evaluate(body);
  console.log(JSON.stringify(out, null, 1));
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
