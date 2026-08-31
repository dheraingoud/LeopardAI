import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.waitForTimeout(1200);
  const html = await p.evaluate(() => {
    const el = document.querySelector("main .isolate");
    return el ? el.outerHTML.slice(0, 4000) : "NOT FOUND";
  });
  console.log(html);
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
