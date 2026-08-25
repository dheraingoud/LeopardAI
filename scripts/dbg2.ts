import { chromium } from "playwright";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto("http://localhost:3001/chat", { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  const ta = p.locator("textarea").first();
  await ta.click();
  await ta.fill("In two sentences, what is amber?");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(6000);
  const info = await p.evaluate(() => {
    const indicators = [...document.querySelectorAll(".animate-pulse, [class*=thinking]")].map(el => ({
      cls: el.className.toString().slice(0, 80),
      text: (el.textContent ?? "").slice(0, 60),
      parent: el.parentElement?.className.toString().slice(0, 80),
    }));
    const carets = document.querySelectorAll(".leopard-stream-caret").length;
    return { indicators: indicators.slice(0, 6), carets };
  });
  console.log(JSON.stringify(info, null, 2));
  await b.close();
})();
