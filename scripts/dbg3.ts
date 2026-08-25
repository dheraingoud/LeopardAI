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
  for (const t of [1500, 3000, 5000, 8000, 12000, 16000]) {
    await p.waitForTimeout(t === 1500 ? 1500 : 2000);
    const s = await p.evaluate(() => ({
      carets: document.querySelectorAll(".leopard-stream-caret").length,
      actions: document.querySelectorAll('[data-slot="message-actions"]').length,
      thinking: document.body.innerText.includes("Working on it"),
      timer: (document.body.innerText.match(/\d+\.\ds/g) ?? []).slice(-1)[0] ?? null,
    }));
    console.log(t + "ms", JSON.stringify(s));
  }
  await b.close();
})();
