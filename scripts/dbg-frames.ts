import { chromium } from "playwright";
async function main() {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForSelector('[data-slot="composer-bar"]');
  await p.waitForTimeout(1500);
  console.log("frames:", p.frames().map((f) => f.url()));
  const iframes = await p.evaluate(() =>
    Array.from(document.querySelectorAll("iframe")).map((f) => {
      const r = f.getBoundingClientRect();
      return { src: f.src.slice(0, 80), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
    }),
  );
  console.log("iframes:", JSON.stringify(iframes));
  // poll: hide portal, does disc vanish? sample pixel darkness at (640,235)
  const dark = async () =>
    p.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 4; c.height = 4;
      const ctx = c.getContext("2d");
      // can't read page pixels from canvas w/o html2canvas — use elementFromPoint trick instead
      return null;
    });
  await dark();
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
